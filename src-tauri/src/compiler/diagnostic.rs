use serde::Serialize;

pub const DSL_DUPLICATE_FIXTURE_ID: &str = "DSL_DUPLICATE_FIXTURE_ID";
pub const DSL_JSON_PARSE: &str = "DSL_JSON_PARSE";
pub const DSL_TARGET_GROUP_NOT_FOUND: &str = "DSL_TARGET_GROUP_NOT_FOUND";
pub const DOC_INVALID_SCHEMA_VERSION: &str = "DOC_INVALID_SCHEMA_VERSION";
pub const DOC_SCHEMA_INVALID: &str = "DOC_SCHEMA_INVALID";
pub const DOC_SVG_PATH_INVALID: &str = "DOC_SVG_PATH_INVALID";
pub const DOC_UNSUPPORTED_SCHEMA_VERSION: &str = "DOC_UNSUPPORTED_SCHEMA_VERSION";
pub const DOC_AMBIGUOUS_REFERENCE: &str = "DOC_AMBIGUOUS_REFERENCE";
pub const DOC_ATTRIBUTE_NOT_SUPPORTED: &str = "DOC_ATTRIBUTE_NOT_SUPPORTED";
pub const DOC_ATTRIBUTE_OUT_OF_RANGE: &str = "DOC_ATTRIBUTE_OUT_OF_RANGE";
pub const DOC_DUPLICATE_ID: &str = "DOC_DUPLICATE_ID";
pub const DOC_EFFECT_DEFINITION_NOT_FOUND: &str = "DOC_EFFECT_DEFINITION_NOT_FOUND";
pub const DOC_EFFECT_GRAPH_INVALID: &str = "DOC_EFFECT_GRAPH_INVALID";
pub const DOC_EFFECT_INSTANCE_NOT_FOUND: &str = "DOC_EFFECT_INSTANCE_NOT_FOUND";
pub const DOC_FIXTURE_REFERENCE_NOT_FOUND: &str = "DOC_FIXTURE_REFERENCE_NOT_FOUND";
pub const DOC_FORMULA_INVALID: &str = "DOC_FORMULA_INVALID";
pub const DOC_INVALID_COLOR: &str = "DOC_INVALID_COLOR";
pub const DOC_INVALID_NUMBER: &str = "DOC_INVALID_NUMBER";
pub const DOC_INVALID_PHASE_CONFIG: &str = "DOC_INVALID_PHASE_CONFIG";
pub const DOC_INVALID_RANGE: &str = "DOC_INVALID_RANGE";
pub const DOC_INVALID_VALUE: &str = "DOC_INVALID_VALUE";
pub const DOC_PARAMETER_INVALID: &str = "DOC_PARAMETER_INVALID";
pub const DOC_PHASER_REFERENCE_NOT_FOUND: &str = "DOC_PHASER_REFERENCE_NOT_FOUND";
pub const DOC_PROFILE_NOT_FOUND: &str = "DOC_PROFILE_NOT_FOUND";
pub const DOC_TIMELINE_TARGET_INVALID: &str = "DOC_TIMELINE_TARGET_INVALID";
pub const CATALOG_GRAPH_BINDING_INVALID: &str = "CATALOG_GRAPH_BINDING_INVALID";
pub const CATALOG_METADATA_INVALID: &str = "CATALOG_METADATA_INVALID";
pub const CATALOG_PARAMETER_INVALID: &str = "CATALOG_PARAMETER_INVALID";
pub const CATALOG_OUTPUT_INVALID: &str = "CATALOG_OUTPUT_INVALID";
pub const CUE_RECIPE_INVALID: &str = "CUE_RECIPE_INVALID";
pub const CUE_RECIPE_UNRESOLVED: &str = "CUE_RECIPE_UNRESOLVED";
pub const CUE_LAYER_ATTRIBUTE_CONFLICT: &str = "CUE_LAYER_ATTRIBUTE_CONFLICT";
pub const PROJECT_CAPABILITY_MISMATCH: &str = "PROJECT_CAPABILITY_MISMATCH";
pub const PROJECT_ASSET_QUARANTINED: &str = "PROJECT_ASSET_QUARANTINED";
pub const PROJECT_DUPLICATE_ASSET: &str = "PROJECT_DUPLICATE_ASSET";
pub const PROJECT_REFERENCE_CYCLE: &str = "PROJECT_REFERENCE_CYCLE";
pub const PROJECT_REFERENCE_NOT_FOUND: &str = "PROJECT_REFERENCE_NOT_FOUND";
pub const PROJECT_REVISION_MISMATCH: &str = "PROJECT_REVISION_MISMATCH";
pub const PROJECT_REVISION_IMMUTABLE: &str = "PROJECT_REVISION_IMMUTABLE";
pub const PROJECT_SCHEMA_INVALID: &str = "PROJECT_SCHEMA_INVALID";
pub const TARGET_SET_INVALID: &str = "TARGET_SET_INVALID";

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    pub code: String,
    pub severity: DiagnosticSeverity,
    pub path: String,
    pub message: String,
    pub hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset: Option<Box<DiagnosticAsset>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recovery: Option<Box<DiagnosticRecovery>>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct DiagnosticAsset {
    pub kind: String,
    pub id: String,
    pub revision: u32,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct DiagnosticRecovery {
    pub action: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
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
            asset: None,
            recovery: None,
        }
    }

    pub fn with_asset(
        mut self,
        kind: impl Into<String>,
        id: impl Into<String>,
        revision: u32,
    ) -> Self {
        self.asset = Some(Box::new(DiagnosticAsset {
            kind: kind.into(),
            id: id.into(),
            revision,
        }));
        self
    }

    pub fn with_recovery(
        mut self,
        action: impl Into<String>,
        label: impl Into<String>,
        path: Option<String>,
    ) -> Self {
        self.recovery = Some(Box::new(DiagnosticRecovery {
            action: action.into(),
            label: label.into(),
            path,
        }));
        self
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
