use serde::Serialize;

pub const DSL_DUPLICATE_FIXTURE_ID: &str = "DSL_DUPLICATE_FIXTURE_ID";
pub const DSL_JSON_PARSE: &str = "DSL_JSON_PARSE";
pub const DSL_TARGET_GROUP_NOT_FOUND: &str = "DSL_TARGET_GROUP_NOT_FOUND";
pub const DOC_INVALID_SCHEMA_VERSION: &str = "DOC_INVALID_SCHEMA_VERSION";
pub const DOC_SCHEMA_INVALID: &str = "DOC_SCHEMA_INVALID";
pub const DOC_UNSUPPORTED_SCHEMA_VERSION: &str = "DOC_UNSUPPORTED_SCHEMA_VERSION";

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    pub code: String,
    pub severity: DiagnosticSeverity,
    pub path: String,
    pub message: String,
    pub hint: Option<String>,
}

impl Diagnostic {
    pub fn error(
        code: impl Into<String>,
        path: impl Into<String>,
        message: impl Into<String>,
        hint: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            severity: DiagnosticSeverity::Error,
            path: path.into(),
            message: message.into(),
            hint: Some(hint.into()),
        }
    }

    pub fn json_parse(error: &serde_json::Error) -> Self {
        Self::error(
            DSL_JSON_PARSE,
            format!("line {}, column {}", error.line(), error.column()),
            error.to_string(),
            "Fix the JSON syntax at the reported line and column.",
        )
    }
}

impl std::fmt::Display for Diagnostic {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "[{}] {}: {}", self.code, self.path, self.message)
    }
}

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
}

#[cfg(test)]
mod tests {
    use super::{Diagnostic, DiagnosticSeverity, DSL_JSON_PARSE};

    #[test]
    fn json_parse_diagnostic_has_stable_code_location_and_hint() {
        let error = serde_json::from_str::<serde_json::Value>("{\n  invalid\n}")
            .expect_err("fixture must be invalid JSON");
        let diagnostic = Diagnostic::json_parse(&error);

        assert_eq!(diagnostic.code, DSL_JSON_PARSE);
        assert_eq!(diagnostic.severity, DiagnosticSeverity::Error);
        assert_eq!(diagnostic.path, "line 2, column 3");
        assert!(diagnostic.message.contains("line 2 column 3"));
        assert_eq!(
            diagnostic.hint.as_deref(),
            Some("Fix the JSON syntax at the reported line and column.")
        );
    }
}
