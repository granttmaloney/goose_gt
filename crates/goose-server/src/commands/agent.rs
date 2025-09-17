use std::sync::Arc;

use crate::configuration;
use crate::state;
use anyhow::Result;
use axum::middleware;
use etcetera::{choose_app_strategy, AppStrategy};
use goose::agents::Agent;
use goose::config::APP_STRATEGY;
use goose::scheduler_factory::SchedulerFactory;
use goose_server::auth::check_token;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

use goose::providers::pricing::initialize_pricing_cache;

pub async fn run() -> Result<()> {
    // Initialize logging and telemetry
    crate::logging::setup_logging(Some("goosed"))?;

    let settings = configuration::Settings::new()?;

    // Initialize pricing cache on startup
    tracing::info!("Initializing pricing cache...");
    if let Err(e) = initialize_pricing_cache().await {
        tracing::warn!(
            "Failed to initialize pricing cache: {}. Pricing data may not be available.",
            e
        );
    }

    let secret_key =
        std::env::var("GOOSE_SERVER__SECRET_KEY").unwrap_or_else(|_| "test".to_string());

    // Optionally auto-start Podman in the background for containerized extensions
    if should_autostart_podman() {
        info!("Podman autostart enabled via GOOSE_PODMAN_AUTOSTART; attempting background start");
        tokio::spawn(async move {
            if let Err(e) = ensure_podman_running().await {
                tracing::warn!("Podman autostart failed: {}", e);
            }
        });
    }

    let new_agent = Agent::new();
    let agent_ref = Arc::new(new_agent);

    let app_state = state::AppState::new(agent_ref.clone());

    let schedule_file_path = choose_app_strategy(APP_STRATEGY.clone())?
        .data_dir()
        .join("schedules.json");

    let scheduler_instance = SchedulerFactory::create(schedule_file_path).await?;
    app_state.set_scheduler(scheduler_instance.clone()).await;

    // NEW: Provide scheduler access to the agent
    agent_ref.set_scheduler(scheduler_instance).await;

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Create the main app with authentication middleware
    let main_app = crate::routes::configure(app_state.clone()).layer(
        middleware::from_fn_with_state(secret_key.clone(), check_token),
    );

    // Create streaming routes without authentication middleware
    let streaming_app = crate::routes::extension::streaming_routes(app_state);

    // Merge both apps
    let app = main_app.merge(streaming_app).layer(cors);

    let listener = tokio::net::TcpListener::bind(settings.socket_addr()).await?;
    info!("listening on {}", listener.local_addr()?);
    axum::serve(listener, app).await?;
    Ok(())
}

fn should_autostart_podman() -> bool {
    match std::env::var("GOOSE_PODMAN_AUTOSTART") {
        Ok(val) => {
            let v = val.to_ascii_lowercase();
            v == "true" || v == "1" || v == "yes" || v == "on"
        }
        Err(_) => false,
    }
}

async fn ensure_podman_running() -> anyhow::Result<()> {
    use tokio::process::Command;
    use tokio::time::{timeout, Duration};

    // Quick check: if `podman info` works, we're done
    if timeout(
        Duration::from_secs(5),
        Command::new("podman").arg("info").output(),
    )
    .await
    .ok()
    .and_then(|r| r.ok())
    .map(|o| o.status.success())
    .unwrap_or(false)
    {
        tracing::debug!("Podman already running");
        return Ok(());
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        // Try to start the default machine
        tracing::info!("Attempting to start Podman machine...");
        let start_ok = timeout(
            Duration::from_secs(60),
            Command::new("podman").args(["machine", "start"]).output(),
        )
        .await
        .ok()
        .and_then(|r| r.ok())
        .map(|o| o.status.success())
        .unwrap_or(false);

        if !start_ok {
            tracing::warn!("podman machine start failed; attempting init + start");
            let _ = timeout(
                Duration::from_secs(120),
                Command::new("podman").args(["machine", "init"]).output(),
            )
            .await;

            let start_ok = timeout(
                Duration::from_secs(60),
                Command::new("podman").args(["machine", "start"]).output(),
            )
            .await
            .ok()
            .and_then(|r| r.ok())
            .map(|o| o.status.success())
            .unwrap_or(false);

            if !start_ok {
                anyhow::bail!(
                    "Failed to start Podman machine. Please run 'podman machine init' then 'podman machine start' manually."
                );
            }
        }

        tracing::info!("Podman machine started successfully");
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        // Try to start user socket; ignore failures, just warn.
        let _ = timeout(
            Duration::from_secs(10),
            Command::new("systemctl")
                .args(["--user", "start", "podman.socket"])
                .output(),
        )
        .await;

        // Verify again
        let ok = timeout(
            Duration::from_secs(5),
            Command::new("podman").arg("info").output(),
        )
        .await
        .ok()
        .and_then(|r| r.ok())
        .map(|o| o.status.success())
        .unwrap_or(false);
        if ok {
            tracing::info!("Podman is available");
            Ok(())
        } else {
            anyhow::bail!(
                "Podman not available. Ensure podman service/socket is running (e.g., 'systemctl --user start podman.socket')."
            );
        }
    }
}
