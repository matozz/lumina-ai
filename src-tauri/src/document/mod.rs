use crate::compiler::diagnostic::{
    Diagnostic, DOC_INVALID_SCHEMA_VERSION, DOC_SCHEMA_INVALID, DOC_UNSUPPORTED_SCHEMA_VERSION,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct ShowDocumentV1 {
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
    pub meta: MetaDSL,
    pub patch: Vec<PatchDSL>,
    pub layout: LayoutDSL,
    pub groups: Vec<GroupDSL>,
    pub phasers: Vec<PhaserDSL>,
    pub timeline: Option<TimelineDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct MetaDSL {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct PatchDSL {
    #[serde(rename = "type")]
    pub type_: String,
    pub id_range: (u32, u32),
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct LayoutDSL {
    #[serde(rename = "type")]
    pub type_: String,
    pub generator: GeneratorDSL,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(tag = "shape", deny_unknown_fields)]
pub enum GeneratorDSL {
    #[serde(rename = "matrix")]
    Matrix {
        rows: u32,
        columns: u32,
        spacing: f64,
        origin: Option<(f64, f64)>,
    },
    #[serde(rename = "circle")]
    Circle {
        rings: u32,
        increment: u32,
        gap: f64,
        center: Option<(f64, f64)>,
    },
    #[serde(rename = "formula")]
    Formula { formula: FormulaDef },
    #[serde(rename = "svg_path")]
    SvgPath {
        #[serde(rename = "svgPath")]
        svg_path: SvgPathDef,
    },
    #[serde(rename = "custom")]
    Custom { fixtures: Vec<CustomFixturePos> },
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct FormulaDef {
    pub x: String,
    pub y: String,
    pub t_range: (f64, f64),
    pub count: u32,
    pub scale: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct SvgPathDef {
    pub d: String,
    pub sample_count: u32,
    pub scale: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct CustomFixturePos {
    pub id: u32,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct GroupDSL {
    pub name: String,
    pub fixtures: GroupFixturesDSL,
    pub sort_by: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(untagged)]
pub enum GroupFixturesDSL {
    List(Vec<u32>),
    Range(GroupRangeDSL),
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct GroupRangeDSL {
    pub range: (u32, u32),
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct PhaserDSL {
    pub id: String,
    pub name: String,
    pub target: String,
    pub multiplier: Option<f64>,
    pub steps: Vec<PhaserStepDSL>,
    pub phase: PhaseConfigDSL,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct PhaserStepDSL {
    pub values: StepValuesDSL,
    pub width: Option<f64>,
    pub transition: Option<f64>,
    pub accel: Option<i32>,
    pub decel: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct StepValuesDSL {
    pub color: Option<String>,
    pub dimmer: Option<f32>,
    pub pan: Option<f32>,
    pub tilt: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct PhaseConfigDSL {
    pub mode: String,
    pub spread: Option<PhaseSpreadDSL>,
    pub grouped: Option<PhaseGroupedDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct PhaseSpreadDSL {
    pub from: f64,
    pub to: f64,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct PhaseGroupedDSL {
    pub group_size: u32,
    pub spread: (f64, f64),
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TimelineDSL {
    pub events: Vec<TimelineEventDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TimelineEventDSL {
    pub beat: f64,
    pub duration: Option<f64>,
    pub action: TimelineActionDefDSL,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum TimelineActionDefDSL {
    #[serde(rename = "phaser")]
    Phaser { phaser: String },
    #[serde(rename = "animate")]
    Animate {
        target: String,
        from: AnimatableValueDSL,
        to: AnimatableValueDSL,
        easing: Option<EasingDSL>,
    },
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(untagged)]
pub enum AnimatableValueDSL {
    Float(f64),
    Color(String),
}

impl AnimatableValueDSL {
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Self::Float(value) => Some(*value),
            Self::Color(_) => None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum EasingDSL {
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
}

impl EasingDSL {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Linear => "linear",
            Self::EaseIn => "ease_in",
            Self::EaseOut => "ease_out",
            Self::EaseInOut => "ease_in_out",
        }
    }
}

#[derive(Debug, Serialize, JsonSchema, Clone, PartialEq, Eq)]
pub struct MigrationChange {
    pub code: String,
    pub path: String,
    pub message: String,
}

#[derive(Debug, Serialize, JsonSchema, Clone, PartialEq, Eq)]
pub struct MigrationReport {
    pub from_version: Option<u32>,
    pub to_version: u32,
    pub changes: Vec<MigrationChange>,
}

#[derive(Debug, Clone)]
pub struct LoadedDocument {
    pub document: ShowDocumentV1,
    pub migration_report: MigrationReport,
}

pub fn load_document(source: &str) -> Result<LoadedDocument, Diagnostic> {
    let value: serde_json::Value =
        serde_json::from_str(source).map_err(|error| Diagnostic::json_parse(&error))?;
    let from_version = document_version(&value)?;
    let (value, migration_report) = migrate_document(value, from_version, CURRENT_SCHEMA_VERSION)?;

    let document = serde_json::from_value(value).map_err(|error| {
        Diagnostic::error(
            DOC_SCHEMA_INVALID,
            "$",
            error.to_string(),
            "Update the document to match the generated ShowDocumentV1 schema.",
        )
    })?;

    Ok(LoadedDocument {
        document,
        migration_report,
    })
}

pub fn migrate_document(
    mut value: serde_json::Value,
    from_version: Option<u32>,
    to_version: u32,
) -> Result<(serde_json::Value, MigrationReport), Diagnostic> {
    if to_version != CURRENT_SCHEMA_VERSION {
        return Err(unsupported_schema_version(to_version));
    }

    let mut changes = Vec::new();
    match from_version {
        None => {
            let object = value
                .as_object_mut()
                .ok_or_else(top_level_object_diagnostic)?;
            object.insert(
                "schema_version".to_string(),
                serde_json::Value::from(CURRENT_SCHEMA_VERSION),
            );
            changes.push(MigrationChange {
                code: "MIGRATION_ADD_SCHEMA_VERSION".to_string(),
                path: "schema_version".to_string(),
                message: "Added schema_version 1 to a legacy document.".to_string(),
            });
        }
        Some(CURRENT_SCHEMA_VERSION) => {}
        Some(version) => return Err(unsupported_schema_version(version)),
    }

    Ok((
        value,
        MigrationReport {
            from_version,
            to_version,
            changes,
        },
    ))
}

fn document_version(value: &serde_json::Value) -> Result<Option<u32>, Diagnostic> {
    let object = value.as_object().ok_or_else(top_level_object_diagnostic)?;
    object
        .get("schema_version")
        .map(|version| {
            version
                .as_u64()
                .and_then(|value| u32::try_from(value).ok())
                .ok_or_else(|| {
                    Diagnostic::error(
                        DOC_INVALID_SCHEMA_VERSION,
                        "schema_version",
                        "schema_version must be a positive integer.",
                        "Set schema_version to 1 or migrate with a supported Lumina version.",
                    )
                })
        })
        .transpose()
}

fn top_level_object_diagnostic() -> Diagnostic {
    Diagnostic::error(
        DOC_SCHEMA_INVALID,
        "$",
        "Show document must be a JSON object.",
        "Wrap the show fields in a top-level JSON object.",
    )
}

fn unsupported_schema_version(version: u32) -> Diagnostic {
    Diagnostic::error(
        DOC_UNSUPPORTED_SCHEMA_VERSION,
        "schema_version",
        format!("Unsupported schema_version: {version}."),
        format!(
            "Use a Lumina version that supports schema {version}; this build supports schema {CURRENT_SCHEMA_VERSION}."
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::{load_document, CURRENT_SCHEMA_VERSION};
    use crate::compiler::diagnostic::{DOC_SCHEMA_INVALID, DOC_UNSUPPORTED_SCHEMA_VERSION};

    const LEGACY_DOCUMENT: &str = r#"{
      "meta": { "name": "Legacy" },
      "patch": [],
      "layout": { "type": "generator", "generator": { "shape": "custom", "fixtures": [] } },
      "groups": [],
      "phasers": []
    }"#;

    #[test]
    fn migrates_legacy_document_and_reports_the_change() {
        let loaded = load_document(LEGACY_DOCUMENT).expect("legacy document migrates");

        assert_eq!(loaded.document.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(loaded.migration_report.from_version, None);
        assert_eq!(loaded.migration_report.changes.len(), 1);
        assert_eq!(
            loaded.migration_report.changes[0].code,
            "MIGRATION_ADD_SCHEMA_VERSION"
        );
    }

    #[test]
    fn rejects_unknown_newer_schema_versions() {
        let source = LEGACY_DOCUMENT.replacen('{', "{\"schema_version\": 99,", 1);
        let error = load_document(&source).expect_err("future schema must fail closed");

        assert_eq!(error.code, DOC_UNSUPPORTED_SCHEMA_VERSION);
        assert_eq!(error.path, "schema_version");
    }

    #[test]
    fn rejects_unknown_fields() {
        let source = LEGACY_DOCUMENT.replace(
            "\"meta\": { \"name\": \"Legacy\" }",
            "\"meta\": { \"name\": \"Legacy\", \"unknown\": true }",
        );
        let error = load_document(&source).expect_err("unknown field must be rejected");

        assert_eq!(error.code, DOC_SCHEMA_INVALID);
        assert!(error.message.contains("unknown field `unknown`"));
    }
}
