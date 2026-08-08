use crate::compiler::diagnostic::{
    Diagnostic, DOC_INVALID_SCHEMA_VERSION, DOC_SCHEMA_INVALID, DOC_UNSUPPORTED_SCHEMA_VERSION,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

mod effect;
mod generator_registry;
mod production_catalog;
mod project;
mod project_layout;
mod project_validation;
mod timeline;
mod validation;

pub use effect::*;
pub use generator_registry::*;
pub use production_catalog::*;
pub use project::*;
pub use project_layout::*;
#[cfg(test)]
pub(crate) use project_validation::tests::valid_bundle;
pub use project_validation::*;
pub use timeline::*;
pub use validation::{DocumentValidator, ValidatedShow};

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
    pub effect_definitions: Vec<EffectDefinitionDSL>,
    pub effect_instances: Vec<EffectInstanceDSL>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeline: Option<TimelineV1DSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct MetaDSL {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct PatchDSL {
    pub profile_id: String,
    pub id_range: (u32, u32),
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct LayoutDSL {
    #[serde(rename = "type")]
    pub type_: LayoutType,
    pub generator: GeneratorDSL,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum LayoutType {
    Generator,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(tag = "shape", deny_unknown_fields)]
pub enum GeneratorDSL {
    #[serde(rename = "matrix")]
    Matrix {
        #[schemars(range(min = 1))]
        rows: u32,
        #[schemars(range(min = 1))]
        columns: u32,
        #[schemars(range(min = 0.000_001))]
        spacing: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        origin: Option<(f64, f64)>,
    },
    #[serde(rename = "circle")]
    Circle {
        #[schemars(range(min = 1))]
        rings: u32,
        #[schemars(range(min = 1))]
        increment: u32,
        #[schemars(range(min = 0.000_001))]
        gap: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
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
    #[schemars(range(min = 1, max = 1_000_000))]
    pub count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scale: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct SvgPathDef {
    pub d: String,
    #[schemars(range(min = 1, max = 1_000_000))]
    pub sample_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scale: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct CustomFixturePos {
    #[schemars(range(min = 1))]
    pub id: u32,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct GroupDSL {
    pub id: String,
    pub name: String,
    pub fixtures: GroupFixturesDSL,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort_by: Option<SortByDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
pub enum SortByDSL {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "x")]
    X,
    #[serde(rename = "-x")]
    NegativeX,
    #[serde(rename = "y")]
    Y,
    #[serde(rename = "-y")]
    NegativeY,
    #[serde(rename = "distance_center")]
    DistanceCenter,
    #[serde(rename = "-distance_center")]
    NegativeDistanceCenter,
    #[serde(rename = "angle_center")]
    AngleCenter,
    #[serde(rename = "-angle_center")]
    NegativeAngleCenter,
    #[serde(rename = "random")]
    Random,
    #[serde(rename = "x+y")]
    XPlusY,
    #[serde(rename = "-(x+y)")]
    NegativeXPlusY,
}

impl SortByDSL {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::X => "x",
            Self::NegativeX => "-x",
            Self::Y => "y",
            Self::NegativeY => "-y",
            Self::DistanceCenter => "distance_center",
            Self::NegativeDistanceCenter => "-distance_center",
            Self::AngleCenter => "angle_center",
            Self::NegativeAngleCenter => "-angle_center",
            Self::Random => "random",
            Self::XPlusY => "x+y",
            Self::NegativeXPlusY => "-(x+y)",
        }
    }
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
pub struct SequenceStepDSL {
    pub values: StepValuesDSL,
    #[schemars(range(min = 0.0, max = 100.0))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[schemars(range(min = 0.0, max = 100.0))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accel: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decel: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct StepValuesDSL {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[schemars(range(min = 0.0, max = 1.0))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dimmer: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pan: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tilt: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum GlobalParameterDSL {
    MasterDimmer,
}

#[derive(Debug, Clone)]
pub struct LoadedDocument {
    pub document: ShowDocumentV1,
}

pub fn load_document(source: &str) -> Result<LoadedDocument, Diagnostic> {
    let value: serde_json::Value =
        serde_json::from_str(source).map_err(|error| Diagnostic::json_parse(&error))?;
    let version = document_version(&value)?;
    if version != CURRENT_SCHEMA_VERSION {
        return Err(unsupported_schema_version(version));
    }
    let document = serde_json::from_value(value).map_err(|error| {
        Diagnostic::error(
            DOC_SCHEMA_INVALID,
            "$",
            error.to_string(),
            "Update the document to match the generated ShowDocumentV1 schema.",
        )
    })?;
    Ok(LoadedDocument { document })
}

fn document_version(value: &serde_json::Value) -> Result<u32, Diagnostic> {
    value
        .as_object()
        .ok_or_else(|| {
            Diagnostic::error(
                DOC_SCHEMA_INVALID,
                "$",
                "Show document must be a JSON object.",
                "Wrap the show fields in a top-level JSON object.",
            )
        })?
        .get("schema_version")
        .and_then(serde_json::Value::as_u64)
        .and_then(|version| u32::try_from(version).ok())
        .ok_or_else(|| {
            Diagnostic::error(
                DOC_INVALID_SCHEMA_VERSION,
                "schema_version",
                "schema_version must be the integer 1.",
                "Use a current Lumina V1 document.",
            )
        })
}

fn unsupported_schema_version(version: u32) -> Diagnostic {
    Diagnostic::error(
        DOC_UNSUPPORTED_SCHEMA_VERSION,
        "schema_version",
        format!("Unsupported schema_version: {version}."),
        "This internal-development build accepts only the current Lumina V1 contract.",
    )
}

#[cfg(test)]
mod tests {
    use super::{load_document, CURRENT_SCHEMA_VERSION};
    use crate::compiler::diagnostic::{
        DOC_INVALID_SCHEMA_VERSION, DOC_SCHEMA_INVALID, DOC_UNSUPPORTED_SCHEMA_VERSION,
    };

    const VALID_DOCUMENT: &str = r#"{
      "schema_version": 1,
      "meta": { "name": "V1" },
      "patch": [],
      "layout": { "type": "generator", "generator": { "shape": "custom", "fixtures": [] } },
      "groups": [],
      "effect_definitions": [],
      "effect_instances": []
    }"#;

    #[test]
    fn accepts_only_the_current_v1_document() {
        let loaded = load_document(VALID_DOCUMENT).expect("current V1 document");
        assert_eq!(loaded.document.schema_version, CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn rejects_missing_and_non_v1_schema_versions() {
        let missing = VALID_DOCUMENT.replace("\"schema_version\": 1,", "");
        assert_eq!(
            load_document(&missing)
                .expect_err("version is required")
                .code,
            DOC_INVALID_SCHEMA_VERSION
        );
        let old = VALID_DOCUMENT.replace("\"schema_version\": 1", "\"schema_version\": 4");
        assert_eq!(
            load_document(&old).expect_err("only V1 is accepted").code,
            DOC_UNSUPPORTED_SCHEMA_VERSION
        );
    }

    #[test]
    fn rejects_unknown_fields() {
        let source = VALID_DOCUMENT.replace(
            "\"meta\": { \"name\": \"V1\" }",
            "\"meta\": { \"name\": \"V1\", \"unknown\": true }",
        );
        assert_eq!(
            load_document(&source)
                .expect_err("unknown fields fail closed")
                .code,
            DOC_SCHEMA_INVALID
        );
    }
}
