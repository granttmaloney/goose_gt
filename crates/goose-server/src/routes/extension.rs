use std::env;
use std::path::Path;
use std::sync::Arc;
use std::sync::OnceLock;

use crate::routes::progress_tracker::{
    get_extension_generation_steps, send_progress_update, ProgressStatus, ProgressTracker,
};
use crate::routes::reply::SseResponse;
use crate::state::AppState;
use axum::http::HeaderMap;
use axum::{
    extract::{Query, State},
    routing::post,
    Json, Router,
};
use goose::agents::{
    extension::{Envs, PodmanResourceLimits},
    ExtensionConfig,
};
use http::StatusCode;
use rmcp::model::Tool;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::sync::mpsc;
use tracing;

/// Validate an extension request
fn validate_extension_request(request: &ExtensionConfigRequest) -> Result<(), String> {
    match request {
        ExtensionConfigRequest::PodmanPython {
            name,
            code,
            dependencies: _dependencies,
            timeout,
            ..
        } => {
            if name.is_empty() {
                return Err("Extension name cannot be empty".to_string());
            }
            if code.is_empty() {
                return Err("Extension code cannot be empty".to_string());
            }
            if let Some(timeout) = timeout {
                if *timeout == 0 {
                    return Err("Timeout must be greater than 0".to_string());
                }
            }
            // Check for potentially dangerous code patterns
            let dangerous_patterns = [
                "import os",
                "import subprocess",
                "import sys",
                "exec(",
                "eval(",
                "__import__",
                "open(",
                "file(",
                "input(",
                "raw_input(",
            ];
            for pattern in &dangerous_patterns {
                if code.contains(pattern) {
                    tracing::warn!(
                        "Extension code contains potentially dangerous pattern: {}",
                        pattern
                    );
                }
            }
            Ok(())
        }
        ExtensionConfigRequest::Stdio {
            name,
            cmd,
            args: _args,
            timeout,
            ..
        } => {
            if name.is_empty() {
                return Err("Extension name cannot be empty".to_string());
            }
            if cmd.is_empty() {
                return Err("Command cannot be empty".to_string());
            }
            if let Some(timeout) = timeout {
                if *timeout == 0 {
                    return Err("Timeout must be greater than 0".to_string());
                }
            }
            Ok(())
        }
        ExtensionConfigRequest::Sse { name, uri, .. } => {
            if name.is_empty() {
                return Err("Extension name cannot be empty".to_string());
            }
            if uri.is_empty() {
                return Err("URI cannot be empty".to_string());
            }
            Ok(())
        }
        ExtensionConfigRequest::Builtin { name, .. } => {
            if name.is_empty() {
                return Err("Extension name cannot be empty".to_string());
            }
            Ok(())
        }
        ExtensionConfigRequest::StreamableHttp { name, uri, .. } => {
            if name.is_empty() {
                return Err("Extension name cannot be empty".to_string());
            }
            if uri.is_empty() {
                return Err("URI cannot be empty".to_string());
            }
            Ok(())
        }
        ExtensionConfigRequest::Frontend { name, .. } => {
            if name.is_empty() {
                return Err("Extension name cannot be empty".to_string());
            }
            Ok(())
        }
    }
}

/// Enum representing the different types of extension configuration requests.
#[derive(Deserialize)]
#[serde(tag = "type")]
enum ExtensionConfigRequest {
    /// Server-Sent Events (SSE) extension.
    #[serde(rename = "sse")]
    Sse {
        /// The name to identify this extension
        name: String,
        /// The URI endpoint for the SSE extension.
        uri: String,
        #[serde(default)]
        /// Map of environment variable key to values.
        envs: Envs,
        /// List of environment variable keys. The server will fetch their values from the keyring.
        #[serde(default)]
        env_keys: Vec<String>,
        timeout: Option<u64>,
    },
    /// Standard I/O (stdio) extension.
    #[serde(rename = "stdio")]
    Stdio {
        /// The name to identify this extension
        name: String,
        /// The command to execute.
        cmd: String,
        /// Arguments for the command.
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        /// Map of environment variable key to values.
        envs: Envs,
        /// List of environment variable keys. The server will fetch their values from the keyring.
        #[serde(default)]
        env_keys: Vec<String>,
        timeout: Option<u64>,
    },
    /// Built-in extension that is part of the goose binary.
    #[serde(rename = "builtin")]
    Builtin {
        /// The name of the built-in extension.
        name: String,
        display_name: Option<String>,
        timeout: Option<u64>,
    },
    /// Streamable HTTP extension using MCP Streamable HTTP specification.
    #[serde(rename = "streamable_http")]
    StreamableHttp {
        /// The name to identify this extension
        name: String,
        /// The URI endpoint for the streamable HTTP extension.
        uri: String,
        #[serde(default)]
        /// Map of environment variable key to values.
        envs: Envs,
        /// List of environment variable keys. The server will fetch their values from the keyring.
        #[serde(default)]
        env_keys: Vec<String>,
        /// Custom headers to include in requests.
        #[serde(default)]
        headers: std::collections::HashMap<String, String>,
        timeout: Option<u64>,
    },
    /// Frontend extension that provides tools to be executed by the frontend.
    #[serde(rename = "frontend")]
    Frontend {
        /// The name to identify this extension
        name: String,
        /// The tools provided by this extension
        tools: Vec<Tool>,
        /// Optional instructions for using the tools
        instructions: Option<String>,
    },
    /// Podman-based extension that runs Python code in containers
    #[serde(rename = "podman_python")]
    PodmanPython {
        /// The name to identify this extension
        name: String,
        /// The Python code to execute
        code: String,
        /// Python dependencies to install
        #[serde(default)]
        dependencies: Vec<String>,
        /// Container image to use (defaults to python:3.11-slim)
        #[serde(default)]
        image: Option<String>,
        /// Resource limits for the container
        #[serde(default)]
        resource_limits: Option<PodmanResourceLimits>,
        /// Timeout for the extension execution
        timeout: Option<u64>,
        /// Description of the extension
        description: Option<String>,
    },
}

impl ExtensionConfigRequest {
    /// Get the name of the extension
    fn name(&self) -> &str {
        match self {
            ExtensionConfigRequest::Sse { name, .. } => name,
            ExtensionConfigRequest::Stdio { name, .. } => name,
            ExtensionConfigRequest::Builtin { name, .. } => name,
            ExtensionConfigRequest::StreamableHttp { name, .. } => name,
            ExtensionConfigRequest::Frontend { name, .. } => name,
            ExtensionConfigRequest::PodmanPython { name, .. } => name,
        }
    }
}

/// Response structure for adding an extension.
///
/// - `error`: Indicates whether an error occurred (`true`) or not (`false`).
/// - `message`: Provides detailed error information when `error` is `true`.
#[derive(Serialize)]
struct ExtensionResponse {
    error: bool,
    message: Option<String>,
}

/// Handler for adding a new extension configuration.
async fn add_extension(
    State(state): State<Arc<AppState>>,
    raw: axum::extract::Json<serde_json::Value>,
) -> Result<Json<ExtensionResponse>, StatusCode> {
    // Log the raw request for debugging
    tracing::info!(
        "Received extension request: {}",
        serde_json::to_string_pretty(&raw.0).unwrap()
    );

    // Try to parse into our enum
    let request: ExtensionConfigRequest = match serde_json::from_value(raw.0.clone()) {
        Ok(req) => req,
        Err(e) => {
            tracing::error!("Failed to parse extension request: {}", e);
            tracing::error!(
                "Raw request was: {}",
                serde_json::to_string_pretty(&raw.0).unwrap()
            );
            return Err(StatusCode::UNPROCESSABLE_ENTITY);
        }
    };

    // Validate the request
    if let Err(validation_error) = validate_extension_request(&request) {
        tracing::error!("Extension request validation failed: {}", validation_error);
        return Ok(Json(ExtensionResponse {
            error: true,
            message: Some(format!("Validation error: {}", validation_error)),
        }));
    }

    // If this is a Stdio extension that uses npx, check for Node.js installation
    #[cfg(target_os = "windows")]
    if let ExtensionConfigRequest::Stdio { cmd, .. } = &request {
        if cmd.ends_with("npx.cmd") || cmd.ends_with("npx") {
            // Check if Node.js is installed in standard locations
            let node_exists = std::path::Path::new(r"C:\Program Files\nodejs\node.exe").exists()
                || std::path::Path::new(r"C:\Program Files (x86)\nodejs\node.exe").exists();

            if !node_exists {
                // Get the directory containing npx.cmd
                let cmd_path = std::path::Path::new(&cmd);
                let script_dir = cmd_path.parent().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

                // Run the Node.js installer script
                let install_script = script_dir.join("install-node.cmd");

                if install_script.exists() {
                    eprintln!("Installing Node.js...");
                    let output = std::process::Command::new(&install_script)
                        .arg("https://nodejs.org/dist/v23.10.0/node-v23.10.0-x64.msi")
                        .output()
                        .map_err(|e| {
                            eprintln!("Failed to run Node.js installer: {}", e);
                            StatusCode::INTERNAL_SERVER_ERROR
                        })?;

                    if !output.status.success() {
                        eprintln!(
                            "Failed to install Node.js: {}",
                            String::from_utf8_lossy(&output.stderr)
                        );
                        return Ok(Json(ExtensionResponse {
                            error: true,
                            message: Some(format!(
                                "Failed to install Node.js: {}",
                                String::from_utf8_lossy(&output.stderr)
                            )),
                        }));
                    }
                    eprintln!("Node.js installation completed");
                } else {
                    eprintln!(
                        "Node.js installer script not found at: {}",
                        install_script.display()
                    );
                    return Ok(Json(ExtensionResponse {
                        error: true,
                        message: Some("Node.js installer script not found".to_string()),
                    }));
                }
            }
        }
    }

    // Get the extension name before any moves
    let extension_name = request.name().to_string();

    // Construct ExtensionConfig with Envs populated from keyring based on provided env_keys.
    let extension_config: ExtensionConfig = match request {
        ExtensionConfigRequest::Sse {
            name,
            uri,
            envs,
            env_keys,
            timeout,
        } => ExtensionConfig::Sse {
            name,
            uri,
            envs,
            env_keys,
            description: None,
            timeout,
            bundled: None,
            available_tools: Vec::new(),
        },
        ExtensionConfigRequest::StreamableHttp {
            name,
            uri,
            envs,
            env_keys,
            headers,
            timeout,
        } => ExtensionConfig::StreamableHttp {
            name,
            uri,
            envs,
            env_keys,
            headers,
            description: None,
            timeout,
            bundled: None,
            available_tools: Vec::new(),
        },
        ExtensionConfigRequest::Stdio {
            name,
            cmd,
            args,
            envs,
            env_keys,
            timeout,
        } => {
            // TODO: We can uncomment once bugs are fixed. Check allowlist for Stdio extensions
            // if !is_command_allowed(&cmd, &args) {
            //     return Ok(Json(ExtensionResponse {
            //         error: true,
            //         message: Some(format!(
            //             "Extension '{}' is not in the allowed extensions list. Command: '{} {}'. If you require access please ask your administrator to update the allowlist.",
            //             args.join(" "),
            //             cmd, args.join(" ")
            //         )),
            //     }));
            // }

            ExtensionConfig::Stdio {
                name,
                cmd,
                args,
                description: None,
                envs,
                env_keys,
                timeout,
                bundled: None,
                available_tools: Vec::new(),
            }
        }
        ExtensionConfigRequest::Builtin {
            name,
            display_name,
            timeout,
        } => ExtensionConfig::Builtin {
            name,
            display_name,
            timeout,
            bundled: None,
            description: None,
            available_tools: Vec::new(),
        },
        ExtensionConfigRequest::Frontend {
            name,
            tools,
            instructions,
        } => ExtensionConfig::Frontend {
            name,
            tools,
            instructions,
            bundled: None,
            available_tools: Vec::new(),
        },
        ExtensionConfigRequest::PodmanPython {
            name,
            code,
            dependencies,
            image,
            resource_limits,
            timeout,
            description,
        } => {
            // Check if Podman is available, if not handle based on dependencies/code
            if !is_podman_available().await {
                // If the requested extension requires external dependencies, do NOT fall back to stdio.
                // Instead, return a clear error so the UI can instruct the user to enable Podman.
                let code_lower = code.to_lowercase();
                let requires_external_libs = !dependencies.is_empty()
                    || code_lower.contains("import pandas")
                    || code_lower.contains("import numpy")
                    || code_lower.contains("import matplotlib")
                    || code_lower.contains("import sklearn");

                if requires_external_libs {
                    tracing::warn!(
                        "Podman not available, and extension '{}' requires external dependencies; refusing stdio fallback",
                        name
                    );
                    return Ok(Json(ExtensionResponse {
                        error: true,
                        message: Some("Podman is not available. This extension requires external Python libraries and must run in a container. Install/start Podman or enable GOOSE_PODMAN_AUTOSTART and try again.".to_string()),
                    }));
                }

                tracing::warn!(
                    "Podman not available, falling back to stdio extension for: {}",
                    name
                );

                // Create a simple stdio extension that can handle the user's Python code
                // We'll use a basic MCP-compatible wrapper
                let wrapped_code = format!(
                    r#"
import sys
import json
import io
import contextlib

# Capture stdout to return as JSON
output = io.StringIO()

# Original user code
{}

# Simple MCP-like interface
def process_request(data):
    try:
        # Execute the original code logic
        with contextlib.redirect_stdout(output):
            # If the code defines a main function or similar, call it
            if 'main' in globals():
                result = main()
            elif 'process' in globals():
                result = process(data)
            else:
                # Try to execute the code directly
                exec(compile('''{}''', '<string>', 'exec'))
                result = {{"status": "success", "output": output.getvalue()}}
        return result
    except Exception as e:
        return {{"error": str(e), "type": "execution_error"}}

# Read from stdin and write to stdout
if __name__ == "__main__":
    try:
        # Simple protocol: read JSON from stdin, write JSON to stdout
        for line in sys.stdin:
            if line.strip():
                try:
                    request = json.loads(line.strip())
                    response = process_request(request)
                    print(json.dumps(response))
                    sys.stdout.flush()
                except json.JSONDecodeError:
                    # If not JSON, treat as plain text input
                    response = process_request(line.strip())
                    print(json.dumps(response))
                    sys.stdout.flush()
    except KeyboardInterrupt:
        pass
"#,
                    code, code
                );

                ExtensionConfig::Stdio {
                    name,
                    cmd: "uv".to_string(),
                    args: vec![
                        "run".to_string(),
                        "python".to_string(),
                        "-c".to_string(),
                        wrapped_code,
                    ],
                    envs: Envs::default(),
                    env_keys: Vec::new(),
                    timeout,
                    description: Some(format!(
                        "{} (Podman fallback)",
                        description.as_deref().unwrap_or("Extension")
                    )),
                    bundled: None,
                    available_tools: Vec::new(),
                }
            } else {
                ExtensionConfig::PodmanPython {
                    name,
                    code,
                    dependencies,
                    image,
                    resource_limits,
                    timeout,
                    description,
                    bundled: None,
                    available_tools: Vec::new(),
                }
            }
        }
    };

    let agent = state.get_agent().await;
    let response = agent.add_extension(extension_config).await;

    // Respond with the result.
    match response {
        Ok(_) => {
            tracing::info!("Successfully added extension: {}", extension_name);
            Ok(Json(ExtensionResponse {
                error: false,
                message: None,
            }))
        }
        Err(e) => {
            tracing::error!("Failed to add extension configuration: {:?}", e);

            // Provide more detailed error information
            let error_message = match &e {
                goose::agents::extension::ExtensionError::ProcessExit(process_exit) => {
                    format!("Extension process failed to start: {}", process_exit)
                }
                goose::agents::extension::ExtensionError::InitializeError(init_error) => {
                    format!("Failed to initialize MCP client: {}", init_error)
                }
                goose::agents::extension::ExtensionError::SetupError(setup_error) => {
                    format!("Extension setup failed: {}", setup_error)
                }
                goose::agents::extension::ExtensionError::PodmanNotAvailable => {
                    "Podman is not available or not installed".to_string()
                }
                _ => format!("Extension error: {:?}", e),
            };

            Ok(Json(ExtensionResponse {
                error: true,
                message: Some(error_message),
            }))
        }
    }
}

/// Handler for removing an extension by name
async fn remove_extension(
    State(state): State<Arc<AppState>>,
    Json(name): Json<String>,
) -> Result<Json<ExtensionResponse>, StatusCode> {
    let agent = state.get_agent().await;
    match agent.remove_extension(&name).await {
        Ok(_) => Ok(Json(ExtensionResponse {
            error: false,
            message: None,
        })),
        Err(e) => Ok(Json(ExtensionResponse {
            error: true,
            message: Some(format!("Failed to remove extension: {:?}", e)),
        })),
    }
}

#[utoipa::path(
    post,
    path = "/extensions/generate",
    request_body = GenerateExtensionRequest,
    responses(
        (status = 200, description = "Extension generated successfully", body = ExtensionResponse),
        (status = 400, description = "Bad request"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Extension Management"
)]
/// Handler for generating an extension from AI prompt
async fn generate_extension_from_prompt(
    State(state): State<Arc<AppState>>,
    Json(request): Json<GenerateExtensionRequest>,
) -> Result<Json<ExtensionResponse>, StatusCode> {
    tracing::info!(
        "Received AI extension generation request: {}",
        request.prompt
    );

    // Create progress tracker
    let mut progress_tracker = ProgressTracker::new(get_extension_generation_steps());

    // Start the first step
    if let Err(e) = progress_tracker.start_step("validate_request", "Validating extension request")
    {
        tracing::error!("Failed to start validation step: {}", e);
        return Ok(Json(ExtensionResponse {
            error: true,
            message: Some(format!("Failed to start validation: {}", e)),
        }));
    }

    let agent = state.get_agent().await;

    // Use a subagent to generate the extension configuration
    let task_config = goose::agents::TaskConfig::new(agent.provider().await.ok());

    // Complete validation step
    if let Err(e) =
        progress_tracker.complete_step("validate_request", "Request validated successfully", None)
    {
        tracing::error!("Failed to complete validation step: {}", e);
        return Ok(Json(ExtensionResponse {
            error: true,
            message: Some(format!("Failed to complete validation: {}", e)),
        }));
    }

    // Start code generation step
    if let Err(e) =
        progress_tracker.start_step("generate_code", "Generating extension code with AI")
    {
        tracing::error!("Failed to start code generation step: {}", e);
        return Ok(Json(ExtensionResponse {
            error: true,
            message: Some(format!("Failed to start code generation: {}", e)),
        }));
    }

    match goose::agents::subagent_handler::run_complete_subagent_task_with_options(
        format!(
            r#"Create a custom extension based on this description: {}

EXTENSION TYPE SELECTION:

Choose the appropriate extension type based on complexity:

1. SIMPLE EXTENSIONS (use stdio type):
   - Basic data processing with standard library only
   - No external dependencies (pandas, numpy, etc.)
   - Simple file operations, CSV parsing, JSON processing
   - No loops, conditionals, or complex logic
   
2. COMPLEX EXTENSIONS (use podman_python type):
   - Requires external libraries (pandas, numpy, matplotlib, etc.)
   - Complex data analysis, machine learning, visualization
   - Multiple files, complex algorithms, loops, conditionals
   - Any code that can't run with basic Python standard library

SIMPLE EXTENSION FORMAT (stdio):
{{
  "type": "stdio",
  "name": "extension-name",
  "description": "Your description here",
  "cmd": "uv",
  "args": ["run", "python", "-c", "your_simple_python_code_here"],
  "timeout": 30
}}

COMPLEX EXTENSION FORMAT (podman_python):
{{
  "type": "podman_python",
  "name": "extension-name",
  "description": "Your description here",
  "code": "your_complex_python_code_here",
  "dependencies": ["pandas", "numpy", "matplotlib"],
  "timeout": 60
}}

SIMPLE EXTENSION REQUIREMENTS:
- Use ONLY standard library: csv, json, sys, statistics, collections, os, pathlib
- NO loops, NO conditionals, NO try/except
- NO list comprehensions, NO dictionary comprehensions
- Use semicolons (;) to separate statements
- Maximum 4 simple statements only
- Example: import csv, json, sys; f = open(sys.argv[1], 'r'); data = list(csv.DictReader(f)); print(json.dumps({{"rows": len(data)}}))

COMPLEX EXTENSION REQUIREMENTS:
- Can use ANY Python libraries (pandas, numpy, matplotlib, scikit-learn, etc.)
- Can use loops, conditionals, functions, classes
- Can be multiple lines of complex code
- Dependencies will be automatically installed in container
- Code runs in isolated Podman container for security

MCP WRAPPER COMPATIBILITY (podman_python):
- You MUST implement either:
  - def process(data): returns a JSON-serializable result (preferred), or
  - def main(): returns a JSON-serializable result.
- Prefer `process(data)`. It receives a dict parsed from the input.
- Minimal example: def process(data): return "ok"

DECISION CRITERIA:
- If the task requires pandas, numpy, matplotlib, or any external library → use podman_python
- If the task is simple file processing with standard library → use stdio
- If the task involves data analysis, visualization, or ML → use podman_python
- If the task is basic CSV/JSON processing → use stdio

Return ONLY the JSON configuration object, nothing else."#,
            request.prompt
        ),
        task_config,
        true, // return_last_only
    ).await {
        Ok(response_text) => {
            // Complete code generation step
            if let Err(e) = progress_tracker.complete_step("generate_code", "AI code generation completed", Some(format!("Generated {} characters", response_text.len()))) {
                tracing::error!("Failed to complete code generation step: {}", e);
                return Ok(Json(ExtensionResponse {
                    error: true,
                    message: Some(format!("Failed to complete code generation: {}", e)),
                }));
            }

            // Start parsing step
            if let Err(e) = progress_tracker.start_step("parse_response", "Parsing AI response") {
                tracing::error!("Failed to start parsing step: {}", e);
                return Ok(Json(ExtensionResponse {
                    error: true,
                    message: Some(format!("Failed to start parsing: {}", e)),
                }));
            }

            // Try to parse the JSON configuration
            if let Ok(extension_config) = serde_json::from_str::<serde_json::Value>(&response_text) {
                // Complete parsing step
                if let Err(e) = progress_tracker.complete_step("parse_response", "Successfully parsed JSON configuration", None) {
                    tracing::error!("Failed to complete parsing step: {}", e);
                    return Ok(Json(ExtensionResponse {
                        error: true,
                        message: Some(format!("Failed to complete parsing: {}", e)),
                    }));
                }

                // Start extension creation step
                if let Err(e) = progress_tracker.start_step("create_extension", "Creating extension configuration") {
                    tracing::error!("Failed to start extension creation step: {}", e);
                    return Ok(Json(ExtensionResponse {
                        error: true,
                        message: Some(format!("Failed to start extension creation: {}", e)),
                    }));
                }

                // Add the extension using the existing add_extension logic
                let add_response = add_extension(State(state), Json(extension_config)).await;
                match add_response {
                    Ok(response) => {
                        // Complete all steps
                        if let Err(e) = progress_tracker.complete_step("create_extension", "Extension created successfully", None) {
                            tracing::error!("Failed to complete extension creation step: {}", e);
                            return Ok(Json(ExtensionResponse {
                                error: true,
                                message: Some(format!("Failed to complete extension creation: {}", e)),
                            }));
                        }
                        progress_tracker.complete_all();
                        Ok(response)
                    },
                    Err(e) => {
                        if let Err(err) = progress_tracker.fail_step("create_extension", "Failed to create extension", Some(format!("{:?}", e))) {
                            tracing::error!("Failed to record failure: {}", err);
                        }
                        tracing::error!("Failed to add generated extension: {:?}", e);
                        Ok(Json(ExtensionResponse {
                            error: true,
                            message: Some(format!("Failed to add generated extension: {:?}", e)),
                        }))
                    }
                }
            } else {
                // If JSON parsing fails, try to extract JSON from the response
                if let Err(e) = progress_tracker.start_step("parse_response", "Attempting to extract JSON from response") {
                    tracing::error!("Failed to start JSON extraction step: {}", e);
                    return Ok(Json(ExtensionResponse {
                        error: true,
                        message: Some(format!("Failed to start JSON extraction: {}", e)),
                    }));
                }

                let json_start = response_text.find('{');
                let json_end = response_text.rfind('}');

                if let (Some(start), Some(end)) = (json_start, json_end) {
                    let json_str = &response_text[start..=end];
                    if let Ok(extension_config) = serde_json::from_str::<serde_json::Value>(json_str) {
                        if let Err(e) = progress_tracker.complete_step("parse_response", "Successfully extracted JSON from response", None) {
                            tracing::error!("Failed to complete JSON extraction step: {}", e);
                            return Ok(Json(ExtensionResponse {
                                error: true,
                                message: Some(format!("Failed to complete JSON extraction: {}", e)),
                            }));
                        }
                        if let Err(e) = progress_tracker.start_step("create_extension", "Creating extension configuration") {
                            tracing::error!("Failed to start extension creation step: {}", e);
                            return Ok(Json(ExtensionResponse {
                                error: true,
                                message: Some(format!("Failed to start extension creation: {}", e)),
                            }));
                        }

                        let add_response = add_extension(State(state), Json(extension_config)).await;
                        match add_response {
                            Ok(response) => {
                                if let Err(e) = progress_tracker.complete_step("create_extension", "Extension created successfully", None) {
                                    tracing::error!("Failed to complete extension creation step: {}", e);
                                    return Ok(Json(ExtensionResponse {
                                        error: true,
                                        message: Some(format!("Failed to complete extension creation: {}", e)),
                                    }));
                                }
                                progress_tracker.complete_all();
                                Ok(response)
                            },
                            Err(e) => {
                                if let Err(err) = progress_tracker.fail_step("create_extension", "Failed to create extension", Some(format!("{:?}", e))) {
                                    tracing::error!("Failed to record failure: {}", err);
                                }
                                tracing::error!("Failed to add generated extension: {:?}", e);
                                Ok(Json(ExtensionResponse {
                                    error: true,
                                    message: Some(format!("Failed to add generated extension: {:?}", e)),
                                }))
                            }
                        }
                    } else {
                        if let Err(err) = progress_tracker.fail_step("parse_response", "Failed to parse extracted JSON", Some("Invalid JSON format".to_string())) {
                            tracing::error!("Failed to record failure: {}", err);
                        }
                        Ok(Json(ExtensionResponse {
                            error: true,
                            message: Some("Failed to parse generated extension configuration. Please try a more specific prompt.".to_string()),
                        }))
                    }
                } else {
                    if let Err(err) = progress_tracker.fail_step("parse_response", "Failed to extract JSON from response", Some("No JSON object found".to_string())) {
                        tracing::error!("Failed to record failure: {}", err);
                    }
                    Ok(Json(ExtensionResponse {
                        error: true,
                        message: Some("Failed to extract extension configuration from AI response. Please try a more specific prompt.".to_string()),
                    }))
                }
            }
        }
        Err(e) => {
            if let Err(err) = progress_tracker.fail_step("generate_code", "AI code generation failed", Some(format!("{:?}", e))) {
                tracing::error!("Failed to record failure: {}", err);
            }
            tracing::error!("Failed to generate extension: {:?}", e);
            Ok(Json(ExtensionResponse {
                error: true,
                message: Some(format!("Failed to generate extension: {:?}", e)),
            }))
        }
    }
}

/// Handler for generating an extension from AI prompt with streaming progress updates
async fn generate_extension_from_prompt_streaming(
    State(state): State<Arc<AppState>>,
    Query(params): Query<std::collections::HashMap<String, String>>,
    headers: HeaderMap,
    Json(request): Json<GenerateExtensionRequest>,
) -> Result<SseResponse, StatusCode> {
    // Check authentication via query parameter OR X-Secret-Key header (either is accepted)
    let secret_key =
        std::env::var("GOOSE_SERVER__SECRET_KEY").unwrap_or_else(|_| "test".to_string());

    let query_secret = params.get("secret_key").map(|s| s.as_str());
    // Support alternative query name as well
    let query_secret_alt = params.get("secret").map(|s| s.as_str());

    let header_secret = headers
        .get("X-Secret-Key")
        .and_then(|value| value.to_str().ok());

    // Also accept Authorization: Bearer <secret>
    let bearer_secret = headers
        .get("Authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|auth| {
            let auth_trimmed = auth.trim();
            // Case-insensitive match for "Bearer"
            if auth_trimmed.len() > 7 && auth_trimmed[..6].eq_ignore_ascii_case("Bearer") {
                Some(auth_trimmed[6..].trim())
            } else {
                None
            }
        });

    match query_secret
        .or(query_secret_alt)
        .or(header_secret)
        .or(bearer_secret)
    {
        Some(provided) if provided == secret_key => {
            // authorized
        }
        _ => {
            tracing::warn!("Unauthorized streaming request: missing or invalid secret key");
            return Err(StatusCode::UNAUTHORIZED);
        }
    }

    tracing::info!(
        "Received streaming AI extension generation request: {}",
        request.prompt
    );

    let (tx, rx) = mpsc::channel(100);

    // Spawn the extension generation task
    tokio::spawn(async move {
        let mut progress_tracker = ProgressTracker::new(get_extension_generation_steps());

        // Send initial progress state
        send_progress_update(
            &tx,
            "validate_request",
            ProgressStatus::InProgress,
            "Starting extension generation",
            None,
        )
        .await;

        // Start the first step
        if let Err(e) =
            progress_tracker.start_step("validate_request", "Validating extension request")
        {
            send_progress_update(
                &tx,
                "validate_request",
                ProgressStatus::Failed,
                &format!("Validation failed: {}", e),
                None,
            )
            .await;
            return;
        }

        let agent = state.get_agent().await;
        let task_config = goose::agents::TaskConfig::new(agent.provider().await.ok());

        // Complete validation step
        if let Err(e) = progress_tracker.complete_step(
            "validate_request",
            "Request validated successfully",
            None,
        ) {
            send_progress_update(
                &tx,
                "validate_request",
                ProgressStatus::Failed,
                &format!("Failed to complete validation: {}", e),
                None,
            )
            .await;
            return;
        }

        // Start code generation step
        send_progress_update(
            &tx,
            "generate_code",
            ProgressStatus::InProgress,
            "Generating extension code with AI",
            None,
        )
        .await;
        if let Err(e) =
            progress_tracker.start_step("generate_code", "Generating extension code with AI")
        {
            send_progress_update(
                &tx,
                "generate_code",
                ProgressStatus::Failed,
                &format!("Failed to start code generation: {}", e),
                None,
            )
            .await;
            return;
        }

        match goose::agents::subagent_handler::run_complete_subagent_task_with_options(
            format!(
                r#"Create a custom extension based on this description: {}

EXTENSION TYPE SELECTION:

Choose the appropriate extension type based on complexity:

1. SIMPLE EXTENSIONS (use stdio type):
   - Basic data processing with standard library only
   - No external dependencies (pandas, numpy, etc.)
   - Simple file operations, CSV parsing, JSON processing
   - No loops, conditionals, or complex logic
   
2. COMPLEX EXTENSIONS (use podman_python type):
   - Requires external libraries (pandas, numpy, matplotlib, etc.)
   - Complex data analysis, machine learning, visualization
   - Multiple files, complex algorithms, loops, conditionals
   - Any code that can't run with basic Python standard library

SIMPLE EXTENSION FORMAT (stdio):
{{
  "type": "stdio",
  "name": "extension-name",
  "description": "Your description here",
  "cmd": "uv",
  "args": ["run", "python", "-c", "your_simple_python_code_here"],
  "timeout": 30
}}

COMPLEX EXTENSION FORMAT (podman_python):
{{
  "type": "podman_python",
  "name": "extension-name",
  "description": "Your description here",
  "code": "your_complex_python_code_here",
  "dependencies": ["pandas", "numpy", "matplotlib"],
  "timeout": 60
}}

SIMPLE EXTENSION REQUIREMENTS:
- Use ONLY standard library: csv, json, sys, statistics, collections, os, pathlib
- NO loops, NO conditionals, NO try/except
- NO list comprehensions, NO dictionary comprehensions
- Use semicolons (;) to separate statements
- Maximum 4 simple statements only
- Example: import csv, json, sys; f = open(sys.argv[1], 'r'); data = list(csv.DictReader(f)); print(json.dumps({{"rows": len(data)}}))

COMPLEX EXTENSION REQUIREMENTS:
- Can use ANY Python libraries (pandas, numpy, matplotlib, scikit-learn, etc.)
- Can use loops, conditionals, functions, classes
- Can be multiple lines of complex code
- Dependencies will be automatically installed in container
- Code runs in isolated Podman container for security

MCP WRAPPER COMPATIBILITY (podman_python):
- You MUST implement either:
  - def process(data): returns a JSON-serializable result (preferred), or
  - def main(): returns a JSON-serializable result.
- Prefer `process(data)`. It receives a dict parsed from the input.
- Minimal example: def process(data): return "ok"

DECISION CRITERIA:
- If the task requires pandas, numpy, matplotlib, or any external library → use podman_python
- If the task is simple file processing with standard library → use stdio
- If the task involves data analysis, visualization, or ML → use podman_python
- If the task is basic CSV/JSON processing → use stdio

Return ONLY the JSON configuration object, nothing else."#,
                request.prompt
            ),
            task_config,
            true, // return_last_only
        ).await {
            Ok(response_text) => {
                // Complete code generation step
                send_progress_update(&tx, "generate_code", ProgressStatus::Completed, "AI code generation completed", Some(format!("Generated {} characters", response_text.len()))).await;
                if let Err(e) = progress_tracker.complete_step("generate_code", "AI code generation completed", Some(format!("Generated {} characters", response_text.len()))) {
                    send_progress_update(&tx, "generate_code", ProgressStatus::Failed, &format!("Failed to complete code generation: {}", e), None).await;
                    return;
                }

                // Start parsing step
                send_progress_update(&tx, "parse_response", ProgressStatus::InProgress, "Parsing AI response", None).await;
                if let Err(e) = progress_tracker.start_step("parse_response", "Parsing AI response") {
                    send_progress_update(&tx, "parse_response", ProgressStatus::Failed, &format!("Failed to start parsing: {}", e), None).await;
                    return;
                }

                // Try to parse the JSON configuration
                if let Ok(extension_config) = serde_json::from_str::<serde_json::Value>(&response_text) {
                    // Complete parsing step
                    send_progress_update(&tx, "parse_response", ProgressStatus::Completed, "Successfully parsed JSON configuration", None).await;
                    if let Err(e) = progress_tracker.complete_step("parse_response", "Successfully parsed JSON configuration", None) {
                        send_progress_update(&tx, "parse_response", ProgressStatus::Failed, &format!("Failed to complete parsing: {}", e), None).await;
                        return;
                    }

                    // Start extension creation step
                    send_progress_update(&tx, "create_extension", ProgressStatus::InProgress, "Creating extension configuration", None).await;
                    if let Err(e) = progress_tracker.start_step("create_extension", "Creating extension configuration") {
                        send_progress_update(&tx, "create_extension", ProgressStatus::Failed, &format!("Failed to start extension creation: {}", e), None).await;
                        return;
                    }

                    // Add the extension using the existing add_extension logic
                    let add_response = add_extension(State(state), Json(extension_config.clone())).await;
                    match add_response {
                        Ok(response) => {
                            // Inspect inner response for error flag
                            if response.0.error {
                                send_progress_update(&tx, "create_extension", ProgressStatus::Failed, "Failed to create extension", response.0.message.clone()).await;
                                let error_event = serde_json::json!({
                                    "type": "extension_complete",
                                    "success": false,
                                    "error": response.0.message.clone().unwrap_or_else(|| "Failed to add generated extension".to_string())
                                });
                                let _ = tx.send(format!("data: {}\n\n", error_event)).await;
                                return;
                            }

                            // Complete all steps
                            send_progress_update(&tx, "create_extension", ProgressStatus::Completed, "Extension created successfully", None).await;
                            if let Err(e) = progress_tracker.complete_step("create_extension", "Extension created successfully", None) {
                                send_progress_update(&tx, "create_extension", ProgressStatus::Failed, &format!("Failed to complete extension creation: {}", e), None).await;
                                return;
                            }
                            progress_tracker.complete_all();

                            // Send final success message including the created extension config
                            let success_event = serde_json::json!({
                                "type": "extension_complete",
                                "success": true,
                                "extension": extension_config
                            });
                            let _ = tx.send(format!("data: {}\n\n", success_event)).await;
                        },
                        Err(e) => {
                            send_progress_update(&tx, "create_extension", ProgressStatus::Failed, "Failed to create extension", Some(format!("{:?}", e))).await;
                            if let Err(e) = progress_tracker.fail_step("create_extension", "Failed to create extension", Some(format!("{:?}", e))) {
                                send_progress_update(&tx, "create_extension", ProgressStatus::Failed, &format!("Failed to record failure: {}", e), None).await;
                            }

                            // Send final error message
                            let error_event = serde_json::json!({
                                "type": "extension_complete",
                                "success": false,
                                "error": format!("Failed to add generated extension: {:?}", e),
                                "extension": extension_config
                            });
                            let _ = tx.send(format!("data: {}\n\n", error_event)).await;
                        }
                    }
                } else {
                    // If JSON parsing fails, try to extract JSON from the response
                    send_progress_update(&tx, "parse_response", ProgressStatus::InProgress, "Attempting to extract JSON from response", None).await;

                    let json_start = response_text.find('{');
                    let json_end = response_text.rfind('}');

                    if let (Some(start), Some(end)) = (json_start, json_end) {
                        let json_str = &response_text[start..=end];
                        if let Ok(extension_config) = serde_json::from_str::<serde_json::Value>(json_str) {
                            send_progress_update(&tx, "parse_response", ProgressStatus::Completed, "Successfully extracted JSON from response", None).await;
                            if let Err(e) = progress_tracker.complete_step("parse_response", "Successfully extracted JSON from response", None) {
                                send_progress_update(&tx, "parse_response", ProgressStatus::Failed, &format!("Failed to complete parsing: {}", e), None).await;
                                return;
                            }

                            send_progress_update(&tx, "create_extension", ProgressStatus::InProgress, "Creating extension configuration", None).await;
                            if let Err(e) = progress_tracker.start_step("create_extension", "Creating extension configuration") {
                                send_progress_update(&tx, "create_extension", ProgressStatus::Failed, &format!("Failed to start extension creation: {}", e), None).await;
                                return;
                            }

                            let add_response = add_extension(State(state), Json(extension_config.clone())).await;
                            match add_response {
                                Ok(response) => {
                                    if response.0.error {
                                        send_progress_update(&tx, "create_extension", ProgressStatus::Failed, "Failed to create extension", response.0.message.clone()).await;
                                        let error_event = serde_json::json!({
                                            "type": "extension_complete",
                                            "success": false,
                                            "error": response.0.message.clone().unwrap_or_else(|| "Failed to add generated extension".to_string())
                                        });
                                        let _ = tx.send(format!("data: {}\n\n", error_event)).await;
                                        return;
                                    }

                                    send_progress_update(&tx, "create_extension", ProgressStatus::Completed, "Extension created successfully", None).await;
                                    if let Err(e) = progress_tracker.complete_step("create_extension", "Extension created successfully", None) {
                                        send_progress_update(&tx, "create_extension", ProgressStatus::Failed, &format!("Failed to complete extension creation: {}", e), None).await;
                                        return;
                                    }
                                    progress_tracker.complete_all();

                                    let success_event = serde_json::json!({
                                        "type": "extension_complete",
                                        "success": true,
                                        "extension": extension_config
                                    });
                                    let _ = tx.send(format!("data: {}\n\n", success_event)).await;
                                },
                                Err(e) => {
                                    send_progress_update(&tx, "create_extension", ProgressStatus::Failed, "Failed to create extension", Some(format!("{:?}", e))).await;
                                    if let Err(e) = progress_tracker.fail_step("create_extension", "Failed to create extension", Some(format!("{:?}", e))) {
                                        send_progress_update(&tx, "create_extension", ProgressStatus::Failed, &format!("Failed to record failure: {}", e), None).await;
                                    }

                                    let error_event = serde_json::json!({
                                        "type": "extension_complete",
                                        "success": false,
                                        "error": format!("Failed to add generated extension: {:?}", e),
                                        "extension": extension_config
                                    });
                                    let _ = tx.send(format!("data: {}\n\n", error_event)).await;
                                }
                            }
                        } else {
                            send_progress_update(&tx, "parse_response", ProgressStatus::Failed, "Failed to parse extracted JSON", Some("Invalid JSON format".to_string())).await;
                            if let Err(e) = progress_tracker.fail_step("parse_response", "Failed to parse extracted JSON", Some("Invalid JSON format".to_string())) {
                                send_progress_update(&tx, "parse_response", ProgressStatus::Failed, &format!("Failed to record failure: {}", e), None).await;
                            }

                            let error_event = serde_json::json!({
                                "type": "extension_complete",
                                "success": false,
                                "error": "Failed to parse generated extension configuration. Please try a more specific prompt."
                            });
                            let _ = tx.send(format!("data: {}\n\n", error_event)).await;
                        }
                    } else {
                        send_progress_update(&tx, "parse_response", ProgressStatus::Failed, "Failed to extract JSON from response", Some("No JSON object found".to_string())).await;
                        if let Err(e) = progress_tracker.fail_step("parse_response", "Failed to extract JSON from response", Some("No JSON object found".to_string())) {
                            send_progress_update(&tx, "parse_response", ProgressStatus::Failed, &format!("Failed to record failure: {}", e), None).await;
                        }

                        let error_event = serde_json::json!({
                            "type": "extension_complete",
                            "success": false,
                            "error": "Failed to extract extension configuration from AI response. Please try a more specific prompt."
                        });
                        let _ = tx.send(format!("data: {}\n\n", error_event)).await;
                    }
                }
            }
            Err(e) => {
                send_progress_update(&tx, "generate_code", ProgressStatus::Failed, "AI code generation failed", Some(format!("{:?}", e))).await;
                if let Err(e) = progress_tracker.fail_step("generate_code", "AI code generation failed", Some(format!("{:?}", e))) {
                    send_progress_update(&tx, "generate_code", ProgressStatus::Failed, &format!("Failed to record failure: {}", e), None).await;
                }

                let error_event = serde_json::json!({
                    "type": "extension_complete",
                    "success": false,
                    "error": format!("Failed to generate extension: {:?}", e)
                });
                let _ = tx.send(format!("data: {}\n\n", error_event)).await;
            }
        }
    });

    Ok(SseResponse::new(
        tokio_stream::wrappers::ReceiverStream::new(rx),
    ))
}

/// Request structure for AI extension generation
#[derive(Deserialize, utoipa::ToSchema)]
pub struct GenerateExtensionRequest {
    /// Natural language description of the desired extension
    pub prompt: String,
}

/// Registers the extension management routes with the Axum router.
pub fn routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/extensions/add", post(add_extension))
        .route("/extensions/remove", post(remove_extension))
        .route("/extensions/generate", post(generate_extension_from_prompt))
        .with_state(state)
}

/// Registers the streaming extension route without authentication middleware.
pub fn streaming_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route(
            "/extensions/generate/stream",
            post(generate_extension_from_prompt_streaming),
        )
        .with_state(state)
}

/// Structure representing the allowed extensions from the YAML file
#[derive(Deserialize, Debug, Clone)]
struct AllowedExtensions {
    #[allow(dead_code)]
    extensions: Vec<ExtensionAllowlistEntry>,
}

/// Structure representing an individual extension entry in the allowlist
#[derive(Deserialize, Debug, Clone)]
struct ExtensionAllowlistEntry {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    command: String,
}

// Global cache for the allowed extensions
#[allow(dead_code)]
static ALLOWED_EXTENSIONS: OnceLock<Option<AllowedExtensions>> = OnceLock::new();

/// Fetches and parses the allowed extensions from the URL specified in GOOSE_ALLOWLIST env var
#[allow(dead_code)]
fn fetch_allowed_extensions() -> Option<AllowedExtensions> {
    match env::var("GOOSE_ALLOWLIST") {
        Err(_) => {
            // Environment variable not set, no allowlist to enforce
            None
        }
        Ok(url) => match reqwest::blocking::get(&url) {
            Err(e) => {
                eprintln!("Failed to fetch allowlist: {}", e);
                None
            }
            Ok(response) if !response.status().is_success() => {
                eprintln!("Failed to fetch allowlist, status: {}", response.status());
                None
            }
            Ok(response) => match response.text() {
                Err(e) => {
                    eprintln!("Failed to read allowlist response: {}", e);
                    None
                }
                Ok(text) => match serde_yaml::from_str::<AllowedExtensions>(&text) {
                    Ok(allowed) => Some(allowed),
                    Err(e) => {
                        eprintln!("Failed to parse allowlist YAML: {}", e);
                        None
                    }
                },
            },
        },
    }
}

/// Gets the cached allowed extensions or fetches them if not yet cached
#[allow(dead_code)]
fn get_allowed_extensions() -> &'static Option<AllowedExtensions> {
    ALLOWED_EXTENSIONS.get_or_init(fetch_allowed_extensions)
}

/// Checks if a command is allowed based on the allowlist
#[allow(dead_code)]
fn is_command_allowed(cmd: &str, args: &[String]) -> bool {
    // Check if bypass is enabled
    if let Ok(bypass_value) = env::var("GOOSE_ALLOWLIST_BYPASS") {
        if bypass_value.to_lowercase() == "true" {
            // Bypass the allowlist check
            println!("Allowlist check bypassed due to GOOSE_ALLOWLIST_BYPASS=true");
            return true;
        }
    }

    // Proceed with normal allowlist check
    is_command_allowed_with_allowlist(&make_full_cmd(cmd, args), get_allowed_extensions())
}

fn make_full_cmd(cmd: &str, args: &[String]) -> String {
    // trim each arg string to remove any leading/trailing whitespace
    let args_trimmed = args.iter().map(|arg| arg.trim()).collect::<Vec<&str>>();

    format!("{} {}", cmd.trim(), args_trimmed.join(" ").trim())
}

/// Normalizes a command name by removing common executable extensions (.exe, .cmd, .bat)
/// This makes the allowlist more portable across different operating systems
fn normalize_command_name(cmd: &str) -> String {
    cmd.replace(".exe", "")
        .replace(".cmd", "")
        .replace(".bat", "")
        .replace(" -y ", " ")
        .replace(" -y", "")
        .replace("-y ", "")
        .to_string()
}

/// Implementation of command allowlist checking that takes an explicit allowlist parameter
/// This makes it easier to test without relying on global state
fn is_command_allowed_with_allowlist(
    cmd: &str,
    allowed_extensions: &Option<AllowedExtensions>,
) -> bool {
    // Extract the first part of the command (before any spaces)
    let first_part = cmd.split_whitespace().next().unwrap_or(cmd);

    // Extract the base command name (last part of the path)
    let cmd_base_with_ext = Path::new(first_part)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(first_part);

    // Normalize the command name by removing extensions like .exe or .cmd
    let cmd_base = normalize_command_name(cmd_base_with_ext);

    // Special case: Always allow commands ending with "/goosed" or equal to "goosed"
    // But still enforce that it's in the same directory as the current executable
    if cmd_base == "goosed" {
        // Only allow exact matches (no arguments)
        if cmd == first_part {
            // For absolute paths, check that it's in the same directory as the current executable
            if (first_part.contains('/') || first_part.contains('\\'))
                && !first_part.starts_with("./")
            {
                let current_exe = std::env::current_exe().unwrap();
                let current_exe_dir = current_exe.parent().unwrap();
                let expected_path = current_exe_dir.join("goosed").to_str().unwrap().to_string();

                // Normalize both paths before comparing
                let normalized_cmd_path = normalize_command_name(first_part);
                let normalized_expected_path = normalize_command_name(&expected_path);

                if normalized_cmd_path == normalized_expected_path {
                    return true;
                }
                // If the path doesn't match, don't allow it
                println!("Goosed not in expected directory: {}", cmd);
                println!("Expected path: {}", expected_path);
                return false;
            } else {
                // For non-path goosed or relative paths, allow it
                return true;
            }
        }
        return false;
    }

    match allowed_extensions {
        // No allowlist configured, allow all commands
        None => true,

        // Empty allowlist, allow all commands
        Some(extensions) if extensions.extensions.is_empty() => true,

        // Check against the allowlist
        Some(extensions) => {
            // Strip out the Goose app resources/bin prefix if present (handle both macOS and Windows paths)
            let mut cmd_to_check = cmd.to_string();
            let mut is_goose_path = false;

            // Check for macOS-style Goose.app path
            if cmd_to_check.contains("Goose.app/Contents/Resources/bin/") {
                if let Some(idx) = cmd_to_check.find("Goose.app/Contents/Resources/bin/") {
                    cmd_to_check = cmd_to_check
                        [(idx + "Goose.app/Contents/Resources/bin/".len())..]
                        .to_string();
                    is_goose_path = true;
                }
            }
            // Check for Windows-style Goose path with resources\bin
            else if cmd_to_check.to_lowercase().contains("\\resources\\bin\\")
                || cmd_to_check.contains("/resources/bin/")
            {
                // Also handle forward slashes
                if let Some(idx) = cmd_to_check
                    .to_lowercase()
                    .rfind("\\resources\\bin\\")
                    .or_else(|| cmd_to_check.rfind("/resources/bin/"))
                {
                    let path_len = if cmd_to_check.contains("/resources/bin/") {
                        "/resources/bin/".len()
                    } else {
                        "\\resources\\bin\\".len()
                    };
                    cmd_to_check = cmd_to_check[(idx + path_len)..].to_string();
                    is_goose_path = true;
                }
            }

            // Only check current directory for non-Goose paths
            if !is_goose_path {
                // Check that the command exists as a peer command to current executable directory
                // Only apply this check if the command includes a path separator
                let current_exe = std::env::current_exe().unwrap();
                let current_exe_dir = current_exe.parent().unwrap();
                let expected_path = current_exe_dir
                    .join(&cmd_base)
                    .to_str()
                    .unwrap()
                    .to_string();

                // Normalize both paths before comparing
                let normalized_cmd_path = normalize_command_name(first_part);

                if (first_part.contains('/') || first_part.contains('\\'))
                    && normalized_cmd_path != expected_path
                    && !cmd_to_check.contains("Goose.app/Contents/Resources/bin/")
                {
                    println!("Command not in expected directory: {}", cmd);
                    return false;
                }

                // Remove current_exe_dir + "/" from the cmd to clean it up
                let path_to_trim = format!("{}/", current_exe_dir.to_str().unwrap());
                cmd_to_check = cmd_to_check.replace(&path_to_trim, "");
            }

            println!("Command to check after path trimming: {}", cmd_to_check);

            // Remove @version suffix from command parts, but preserve scoped npm packages
            let parts: Vec<&str> = cmd_to_check.split_whitespace().collect();
            let mut cleaned_parts: Vec<String> = Vec::new();

            for part in parts {
                if part.contains('@') && !part.starts_with('@') {
                    // This is likely a package with a version suffix, like "package@1.0.0"
                    // Keep only the part before the @ symbol
                    if let Some(base_part) = part.split('@').next() {
                        cleaned_parts.push(base_part.to_string());
                    } else {
                        cleaned_parts.push(part.to_string());
                    }
                } else {
                    // Either no @ symbol or it's a scoped package (starts with @)
                    cleaned_parts.push(part.to_string());
                }
            }

            // Reconstruct the command without version suffixes
            cmd_to_check = cleaned_parts.join(" ");

            println!("Command to check after @version removal: {}", cmd_to_check);

            // Normalize the command before comparing with allowlist entries
            let normalized_cmd = normalize_command_name(&cmd_to_check);

            println!("Final normalized command: {}", normalized_cmd);

            extensions.extensions.iter().any(|entry| {
                let normalized_entry = normalize_command_name(&entry.command);
                normalized_cmd == normalized_entry
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_normalize_command_name() {
        // Test removing .exe extension
        assert_eq!(normalize_command_name("goosed.exe"), "goosed");
        assert_eq!(
            normalize_command_name("/path/to/goosed.exe"),
            "/path/to/goosed"
        );

        // Test removing .cmd extension
        assert_eq!(normalize_command_name("script.cmd"), "script");
        assert_eq!(
            normalize_command_name("/path/to/script.cmd"),
            "/path/to/script"
        );

        assert_eq!(normalize_command_name("batch.bat"), "batch");

        assert_eq!(normalize_command_name("npx -y thing"), "npx thing");
        assert_eq!(
            normalize_command_name("/path/to/batch.bat thing"),
            "/path/to/batch thing"
        );

        // Test with no extension
        assert_eq!(normalize_command_name("goosed"), "goosed");
        assert_eq!(normalize_command_name("/path/to/goosed"), "/path/to/goosed");
    }

    // Create a test allowlist with the given commands
    fn create_test_allowlist(commands: &[&str]) -> Option<AllowedExtensions> {
        if commands.is_empty() {
            return Some(AllowedExtensions { extensions: vec![] });
        }

        let entries = commands
            .iter()
            .enumerate()
            .map(|(i, cmd)| ExtensionAllowlistEntry {
                id: format!("test-{}", i),
                command: cmd.to_string(),
            })
            .collect();

        Some(AllowedExtensions {
            extensions: entries,
        })
    }

    #[test]
    fn test_make_full() {
        assert_eq!(
            make_full_cmd("uvx", &vec!["mcp_slack".to_string()]),
            "uvx mcp_slack"
        );
        assert_eq!(
            make_full_cmd("uvx", &vec!["mcp_slack ".to_string()]),
            "uvx mcp_slack"
        );
        assert_eq!(
            make_full_cmd(
                "uvx",
                &vec!["mcp_slack".to_string(), "--verbose".to_string()]
            ),
            "uvx mcp_slack --verbose"
        );
        assert_eq!(
            make_full_cmd(
                "uvx",
                &vec!["mcp_slack".to_string(), " --verbose".to_string()]
            ),
            "uvx mcp_slack --verbose"
        );
    }

    #[test]
    fn test_command_allowed_when_matching() {
        let allowlist = create_test_allowlist(&[
            "uvx something",
            "uvx mcp_slack",
            "npx mcp_github",
            "npx -y @mic/mcp_mic",
            "npx -y @mic/mcp_mic2@latest",
            "npx @mic/mcp_mic3",
            "npx @mic/mcp_mic4@latest",
            "executor thing",
            "minecraft",
        ]);

        // Test with exact command matches
        assert!(is_command_allowed_with_allowlist(
            "uvx something",
            &allowlist
        ));

        // Test with exact command matches
        assert!(is_command_allowed_with_allowlist("minecraft", &allowlist));

        assert!(is_command_allowed_with_allowlist(
            "uvx mcp_slack",
            &allowlist
        ));
        assert!(is_command_allowed_with_allowlist(
            "npx mcp_github",
            &allowlist
        ));

        assert!(is_command_allowed_with_allowlist(
            "npx -y mcp_github",
            &allowlist
        ));

        assert!(is_command_allowed_with_allowlist(
            "executor thing",
            &allowlist
        ));

        assert!(!is_command_allowed_with_allowlist(
            "executor thing2",
            &allowlist
        ));

        assert!(!is_command_allowed_with_allowlist(
            "executor2 thing",
            &allowlist
        ));

        assert!(is_command_allowed_with_allowlist(
            "npx -y @mic/mcp_mic",
            &allowlist
        ));

        assert!(is_command_allowed_with_allowlist(
            "npx -y @mic/mcp_mic2@latest",
            &allowlist
        ));

        assert!(is_command_allowed_with_allowlist(
            "npx -y @mic/mcp_mic3",
            &allowlist
        ));

        assert!(is_command_allowed_with_allowlist(
            "npx -y @mic/mcp_mic4@latest",
            &allowlist
        ));

        // Get the current executable directory for reference
        let current_exe = std::env::current_exe().unwrap();
        let current_exe_dir = current_exe.parent().unwrap();

        // Create a full path command that would be in the current executable directory
        // For testing purposes, we'll use a direct path to the command in the allowlist
        let full_path_cmd = current_exe_dir
            .join("uvx my_mcp")
            .to_str()
            .unwrap()
            .to_string();

        // Create a test allowlist with the command name (without path)
        let path_test_allowlist = create_test_allowlist(&["uvx my_mcp"]);

        // This should be allowed because the path is correct and the base command matches
        println!(
            "Current executable directory: {}",
            current_exe_dir.to_str().unwrap()
        );
        println!("Path test allowlist: {:?}", path_test_allowlist);
        assert!(is_command_allowed_with_allowlist(
            &full_path_cmd,
            &path_test_allowlist
        ));

        // Test with additional arguments - should NOT match because we require exact matches
        assert!(!is_command_allowed_with_allowlist(
            "uvx mcp_slack --verbose --flag=value",
            &allowlist
        ));

        // Test with a path that doesn't match the current directory - should fail
        assert!(!is_command_allowed_with_allowlist(
            "/Users/username/path/to/uvx mcp_slack",
            &allowlist
        ));

        // These should NOT match with exact matching
        assert!(!is_command_allowed_with_allowlist(
            "uvx other_command",
            &allowlist
        ));
        assert!(!is_command_allowed_with_allowlist(
            "prefix_npx mcp_github",
            &allowlist
        ));
    }

    #[test]
    fn test_command_allowed_simple() {
        let allowlist = create_test_allowlist(&[
            "uvx something",
            "uvx mcp_slack",
            "npx mcp_github",
            "minecraft",
        ]);

        // Test with version, anything @version can be stripped when matching
        assert!(is_command_allowed_with_allowlist(
            "npx -y mcp_github@latest",
            &allowlist
        ));
    }

    #[test]
    fn test_command_allowed_flexible() {
        let allowlist = create_test_allowlist(&[
            "uvx something",
            "uvx mcp_slack",
            "npx -y mcp_github",
            "npx -y mcp_hammer start",
            "minecraft",
        ]);

        // Test with version, anything @version can be stripped when matching
        assert!(is_command_allowed_with_allowlist(
            "uvx something@1.0.13",
            &allowlist
        ));

        // Test with shim path - 'Goose.app/Contents/Resources/bin/' and before can be stripped to get the command to match
        assert!(is_command_allowed_with_allowlist(
            "/private/var/folders/fq/rd_cb6/T/AppTranslocation/EA0195/d/Goose.app/Contents/Resources/bin/uvx something",
            &allowlist
        ));

        // Test with shim path & latest version
        assert!(is_command_allowed_with_allowlist(
            "/private/var/folders/fq/rd_cb6/T/AppTranslocation/EA0195/d/Goose.app/Contents/Resources/bin/uvx something@latest",
            &allowlist
        ));

        // Test with exact command matches
        assert!(is_command_allowed_with_allowlist(
            "uvx something",
            &allowlist
        ));

        // Test with -y added, it is allowed (ie doesn't matter if we see a -y in there)
        assert!(is_command_allowed_with_allowlist(
            "npx -y mcp_github@latest",
            &allowlist
        ));

        // Test with -y added, and a version and parameter, it is allowed (npx mcp_hammer start is allowed)
        assert!(is_command_allowed_with_allowlist(
            "npx -y mcp_hammer@latest start",
            &allowlist
        ));

        // Test with shim path & latest version
        assert!(is_command_allowed_with_allowlist(
            "/private/var/folders/fq/rd_cb6/T/AppTranslocation/EA0195/d/Goose.app/Contents/Resources/bin/npx -y mcp_hammer@latest start",
            &allowlist
        ));
    }

    #[test]
    fn test_command_not_allowed_when_not_matching() {
        let allowlist =
            create_test_allowlist(&["uvx something", "uvx mcp_slack", "npx mcp_github"]);

        // These should not be allowed
        assert!(!is_command_allowed_with_allowlist(
            "/Users/username/path/to/uvx_malicious",
            &allowlist
        ));
        assert!(!is_command_allowed_with_allowlist(
            "unauthorized_command",
            &allowlist
        ));
        assert!(!is_command_allowed_with_allowlist("/bin/bash", &allowlist));
        assert!(!is_command_allowed_with_allowlist(
            "uvx unauthorized",
            &allowlist
        ));
    }

    #[test]
    fn test_all_commands_allowed_when_no_allowlist() {
        // Empty allowlist should allow all commands
        let empty_allowlist = create_test_allowlist(&[]);
        assert!(is_command_allowed_with_allowlist(
            "any_command_should_be_allowed",
            &empty_allowlist
        ));

        // No allowlist should allow all commands
        assert!(is_command_allowed_with_allowlist(
            "any_command_should_be_allowed",
            &None
        ));
    }

    #[test]
    fn test_goosed_special_case() {
        // Create a restrictive allowlist that doesn't include goosed
        let allowlist = create_test_allowlist(&["uvx mcp_slack"]);

        // Get the current executable directory for goosed path testing
        let current_exe = std::env::current_exe().unwrap();
        let current_exe_dir = current_exe.parent().unwrap();
        let goosed_path = current_exe_dir.join("goosed").to_str().unwrap().to_string();
        let goosed_exe_path = current_exe_dir
            .join("goosed.exe")
            .to_str()
            .unwrap()
            .to_string();

        // This should be allowed because it's goosed in the correct directory
        assert!(is_command_allowed_with_allowlist(&goosed_path, &allowlist));

        // This should also be allowed because it's goosed.exe in the correct directory
        assert!(is_command_allowed_with_allowlist(
            &goosed_exe_path,
            &allowlist
        ));

        // These should NOT be allowed because they're in the wrong directory
        assert!(!is_command_allowed_with_allowlist(
            "/usr/local/bin/goosed",
            &allowlist
        ));
        assert!(!is_command_allowed_with_allowlist(
            "/Users/username/path/to/goosed",
            &allowlist
        ));

        // Commands with arguments should NOT be allowed - we require exact matches
        assert!(!is_command_allowed_with_allowlist(
            "/Users/username/path/to/goosed --flag value",
            &allowlist
        ));

        // Simple goosed without path should be allowed
        assert!(is_command_allowed_with_allowlist("./goosed", &allowlist));
        assert!(is_command_allowed_with_allowlist("goosed", &allowlist));

        // These should NOT be allowed because they don't end with "/goosed"
        assert!(!is_command_allowed_with_allowlist(
            "/usr/local/bin/goosed-extra",
            &allowlist
        ));
        assert!(!is_command_allowed_with_allowlist(
            "/usr/local/bin/not-goosed",
            &allowlist
        ));
        assert!(!is_command_allowed_with_allowlist(
            "goosed-extra",
            &allowlist
        ));
    }

    #[test]
    fn test_windows_paths() {
        let allowlist = create_test_allowlist(&["uvx mcp_snowflake", "uvx mcp_test"]);

        // Test various Windows path formats
        let test_paths = vec![
            // Standard Windows path
            r"C:\Users\MaxNovich\Downloads\Goose-1.0.17\resources\bin\uvx.exe",
            // Path with different casing
            r"C:\Users\MaxNovich\Downloads\Goose-1.0.17\Resources\Bin\uvx.exe",
            // Path with forward slashes
            r"C:/Users/MaxNovich/Downloads/Goose-1.0.17/resources/bin/uvx.exe",
            // Path with spaces
            r"C:\Program Files\Goose 1.0.17\resources\bin\uvx.exe",
            // Path with version numbers
            r"C:\Users\MaxNovich\Downloads\Goose-1.0.17-block.202504072238-76ffe-win32-x64\Goose-1.0.17-block.202504072238-76ffe-win32-x64\resources\bin\uvx.exe",
        ];

        for path in test_paths {
            // Test with @latest version
            let cmd = format!("{} mcp_snowflake@latest", path);
            assert!(
                is_command_allowed_with_allowlist(&cmd, &allowlist),
                "Failed for path: {}",
                path
            );

            // Test with specific version
            let cmd_version = format!("{} mcp_test@1.2.3", path);
            assert!(
                is_command_allowed_with_allowlist(&cmd_version, &allowlist),
                "Failed for path with version: {}",
                path
            );
        }

        // Test invalid paths that should be rejected
        let invalid_paths = vec![
            // Path without resources\bin
            r"C:\Users\MaxNovich\Downloads\uvx.exe",
            // Path with modified resources\bin
            r"C:\Users\MaxNovich\Downloads\Goose-1.0.17\resources_modified\bin\uvx.exe",
            // Path with extra components
            r"C:\Users\MaxNovich\Downloads\Goose-1.0.17\resources\bin\extra\uvx.exe",
        ];

        for path in invalid_paths {
            let cmd = format!("{} mcp_snowflake@latest", path);
            assert!(
                !is_command_allowed_with_allowlist(&cmd, &allowlist),
                "Should have rejected path: {}",
                path
            );
        }
    }

    #[test]
    fn test_windows_uvx_path() {
        let allowlist = create_test_allowlist(&["uvx mcp_snowflake"]);

        // Test Windows-style path with uvx.exe
        let windows_path = r"C:\Users\MaxNovich\Downloads\Goose-1.0.17-block.202504072238-76ffe-win32-x64\Goose-1.0.17-block.202504072238-76ffe-win32-x64\resources\bin\uvx.exe";
        let cmd = format!("{} mcp_snowflake@latest", windows_path);

        // This should be allowed because it's a valid uvx command in the Goose resources/bin directory
        assert!(is_command_allowed_with_allowlist(&cmd, &allowlist));

        // Test with different casing and backslashes
        let windows_path_alt = r"c:\Users\MaxNovich\Downloads\Goose-1.0.17-block.202504072238-76ffe-win32-x64\Goose-1.0.17-block.202504072238-76ffe-win32-x64\Resources\Bin\uvx.exe";
        let cmd_alt = format!("{} mcp_snowflake@latest", windows_path_alt);
        assert!(is_command_allowed_with_allowlist(&cmd_alt, &allowlist));
    }

    #[test]
    fn test_fetch_allowed_extensions_from_url() {
        // Start a mock server - we need to use a blocking approach since fetch_allowed_extensions is blocking
        let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = server.local_addr().unwrap().port();
        let server_url = format!("http://127.0.0.1:{}", port);
        let server_path = "/allowed_extensions.yaml";

        // Define the mock response
        let yaml_content = r#"extensions:
  - id: slack
    command: uvx mcp_slack
  - id: github
    command: uvx mcp_github
"#;

        // Spawn a thread to handle the request
        let handle = std::thread::spawn(move || {
            let (stream, _) = server.accept().unwrap();
            let mut buf_reader = std::io::BufReader::new(&stream);
            let mut request_line = String::new();
            std::io::BufRead::read_line(&mut buf_reader, &mut request_line).unwrap();

            // Very simple HTTP response
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: text/yaml\r\n\r\n{}",
                yaml_content.len(),
                yaml_content
            );

            let mut writer = std::io::BufWriter::new(&stream);
            std::io::Write::write_all(&mut writer, response.as_bytes()).unwrap();
            std::io::Write::flush(&mut writer).unwrap();
        });

        // Set the environment variable to point to our mock server
        env::set_var("GOOSE_ALLOWLIST", format!("{}{}", server_url, server_path));

        // Give the server a moment to start
        std::thread::sleep(std::time::Duration::from_millis(100));

        // Call the function that fetches from the URL
        let allowed_extensions = fetch_allowed_extensions();

        // Verify the result
        assert!(allowed_extensions.is_some());
        let extensions = allowed_extensions.unwrap();
        assert_eq!(extensions.extensions.len(), 2);
        assert_eq!(extensions.extensions[0].id, "slack");
        assert_eq!(extensions.extensions[0].command, "uvx mcp_slack");
        assert_eq!(extensions.extensions[1].id, "github");
        assert_eq!(extensions.extensions[1].command, "uvx mcp_github");

        // Clean up
        env::remove_var("GOOSE_ALLOWLIST");

        // Wait for the server thread to complete
        handle.join().unwrap();
    }

    #[test]
    fn test_allowlist_bypass() {
        // We need to directly test is_command_allowed_with_allowlist with our test allowlist
        // since get_allowed_extensions() might return None in the test environment

        // Create a restrictive allowlist
        let allowlist = create_test_allowlist(&["uvx mcp_slack"]);

        // Command not in allowlist
        let cmd = "uvx unauthorized_command";

        // Without bypass, command should be denied with our test allowlist
        assert!(!is_command_allowed_with_allowlist(cmd, &allowlist));

        // Set the bypass environment variable
        env::set_var("GOOSE_ALLOWLIST_BYPASS", "true");

        // With bypass enabled, any command should be allowed regardless of allowlist
        assert!(is_command_allowed(
            "uvx",
            &vec!["unauthorized_command".to_string()]
        ));

        // Test case insensitivity
        env::set_var("GOOSE_ALLOWLIST_BYPASS", "TRUE");
        assert!(is_command_allowed(
            "uvx",
            &vec!["unauthorized_command".to_string()]
        ));

        // Clean up
        env::remove_var("GOOSE_ALLOWLIST_BYPASS");

        // Create a mock function to test with allowlist and bypass
        let test_with_allowlist_and_bypass = |bypass_value: &str, expected: bool| {
            if bypass_value.is_empty() {
                env::remove_var("GOOSE_ALLOWLIST_BYPASS");
            } else {
                env::set_var("GOOSE_ALLOWLIST_BYPASS", bypass_value);
            }

            // This is what we're testing - a direct call that simulates what happens in is_command_allowed
            let result = if let Ok(bypass) = env::var("GOOSE_ALLOWLIST_BYPASS") {
                if bypass.to_lowercase() == "true" {
                    true
                } else {
                    is_command_allowed_with_allowlist(cmd, &allowlist)
                }
            } else {
                is_command_allowed_with_allowlist(cmd, &allowlist)
            };

            assert_eq!(
                result,
                expected,
                "With GOOSE_ALLOWLIST_BYPASS={}, expected allowed={}",
                if bypass_value.is_empty() {
                    "not set"
                } else {
                    bypass_value
                },
                expected
            );
        };

        // Test various bypass values
        test_with_allowlist_and_bypass("true", true);
        test_with_allowlist_and_bypass("TRUE", true);
        test_with_allowlist_and_bypass("True", true);
        test_with_allowlist_and_bypass("false", false);
        test_with_allowlist_and_bypass("0", false);
        test_with_allowlist_and_bypass("", false);

        // Final cleanup
        env::remove_var("GOOSE_ALLOWLIST_BYPASS");
    }
}

/// Check if Podman is available on the system
async fn is_podman_available() -> bool {
    let output = Command::new("podman").arg("--version").output().await;

    match output {
        Ok(output) => {
            let is_available = output.status.success();
            if is_available {
                tracing::debug!(
                    "Podman is available: {}",
                    String::from_utf8_lossy(&output.stdout)
                );
            } else {
                tracing::debug!(
                    "Podman check failed: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
            }
            is_available
        }
        Err(e) => {
            tracing::debug!("Podman not found: {}", e);
            false
        }
    }
}
