use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct CompileError {
    pub path: String,
    pub message: String,
    pub severity: ErrorSeverity,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "lowercase")]
pub enum ErrorSeverity {
    Error,
    Warning,
}
