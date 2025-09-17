use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProgressStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressStep {
    pub id: String,
    pub title: String,
    pub status: ProgressStatus,
    pub message: String,
    pub details: Option<String>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressTracker {
    pub steps: Vec<ProgressStep>,
    pub current_step: Option<String>,
    pub overall_status: ProgressStatus,
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub end_time: Option<chrono::DateTime<chrono::Utc>>,
}

impl ProgressTracker {
    pub fn new(step_definitions: Vec<(String, String)>) -> Self {
        let now = chrono::Utc::now();
        let steps = step_definitions
            .into_iter()
            .map(|(id, title)| ProgressStep {
                id: id.clone(),
                title,
                status: ProgressStatus::Pending,
                message: "Waiting...".to_string(),
                details: None,
                timestamp: now,
            })
            .collect();

        Self {
            steps,
            current_step: None,
            overall_status: ProgressStatus::Pending,
            start_time: now,
            end_time: None,
        }
    }

    pub fn start_step(&mut self, step_id: &str, message: &str) -> Result<(), String> {
        if let Some(step) = self.steps.iter_mut().find(|s| s.id == step_id) {
            step.status = ProgressStatus::InProgress;
            step.message = message.to_string();
            step.timestamp = chrono::Utc::now();
            self.current_step = Some(step_id.to_string());
            self.overall_status = ProgressStatus::InProgress;
            info!("Progress: Started step '{}' - {}", step_id, message);
            Ok(())
        } else {
            Err(format!("Step '{}' not found", step_id))
        }
    }

    pub fn complete_step(
        &mut self,
        step_id: &str,
        message: &str,
        details: Option<String>,
    ) -> Result<(), String> {
        if let Some(step) = self.steps.iter_mut().find(|s| s.id == step_id) {
            step.status = ProgressStatus::Completed;
            step.message = message.to_string();
            step.details = details;
            step.timestamp = chrono::Utc::now();
            info!("Progress: Completed step '{}' - {}", step_id, message);
            Ok(())
        } else {
            Err(format!("Step '{}' not found", step_id))
        }
    }

    pub fn fail_step(
        &mut self,
        step_id: &str,
        message: &str,
        details: Option<String>,
    ) -> Result<(), String> {
        if let Some(step) = self.steps.iter_mut().find(|s| s.id == step_id) {
            step.status = ProgressStatus::Failed;
            step.message = message.to_string();
            step.details = details;
            step.timestamp = chrono::Utc::now();
            self.overall_status = ProgressStatus::Failed;
            self.end_time = Some(chrono::Utc::now());
            info!("Progress: Failed step '{}' - {}", step_id, message);
            Ok(())
        } else {
            Err(format!("Step '{}' not found", step_id))
        }
    }

    pub fn complete_all(&mut self) {
        self.overall_status = ProgressStatus::Completed;
        self.end_time = Some(chrono::Utc::now());
        self.current_step = None;
        info!("Progress: All steps completed successfully");
    }

    #[allow(dead_code)]
    pub fn get_step(&self, step_id: &str) -> Option<&ProgressStep> {
        self.steps.iter().find(|s| s.id == step_id)
    }

    #[allow(dead_code)]
    pub fn get_current_step(&self) -> Option<&ProgressStep> {
        self.current_step.as_ref().and_then(|id| self.get_step(id))
    }

    #[allow(dead_code)]
    pub fn is_complete(&self) -> bool {
        matches!(
            self.overall_status,
            ProgressStatus::Completed | ProgressStatus::Failed
        )
    }

    #[allow(dead_code)]
    pub fn get_duration(&self) -> Option<chrono::Duration> {
        self.end_time.map(|end| end - self.start_time)
    }
}

// Extension generation specific progress steps
pub fn get_extension_generation_steps() -> Vec<(String, String)> {
    vec![
        (
            "validate_request".to_string(),
            "Validating request".to_string(),
        ),
        (
            "check_podman".to_string(),
            "Checking Podman availability".to_string(),
        ),
        (
            "generate_code".to_string(),
            "Generating extension code".to_string(),
        ),
        (
            "parse_response".to_string(),
            "Parsing AI response".to_string(),
        ),
        (
            "create_extension".to_string(),
            "Creating extension configuration".to_string(),
        ),
        (
            "test_extension".to_string(),
            "Testing extension".to_string(),
        ),
        ("finalize".to_string(), "Finalizing extension".to_string()),
    ]
}

// Helper function to send progress updates
pub async fn send_progress_update(
    tx: &mpsc::Sender<String>,
    step_id: &str,
    status: ProgressStatus,
    message: &str,
    details: Option<String>,
) {
    let progress_event = serde_json::json!({
        "type": "progress",
        "step": step_id,
        "status": status,
        "message": message,
        "details": details
    });

    if tx
        .send(format!("data: {}\n\n", progress_event))
        .await
        .is_err()
    {
        tracing::warn!("Failed to send progress update: client disconnected");
    }
}
