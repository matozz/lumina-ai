use crate::compiler::diagnostic::{
    Diagnostic, DOC_INVALID_PHASE_CONFIG, DOC_INVALID_SCHEMA_VERSION, DOC_SCHEMA_INVALID,
    DOC_UNSUPPORTED_SCHEMA_VERSION,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

mod validation;

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
    pub phasers: Vec<PhaserDSL>,
    #[serde(skip_serializing_if = "Option::is_none")]
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
    pub type_: LegacyFixtureType,
    pub id_range: (u32, u32),
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum LegacyFixtureType {
    Spot,
    Pixel,
}

impl LegacyFixtureType {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Spot => "spot",
            Self::Pixel => "pixel",
        }
    }
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
pub struct PhaserDSL {
    pub id: String,
    pub name: String,
    pub target: String,
    #[schemars(range(min = 0.000_001))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub multiplier: Option<f64>,
    pub steps: Vec<PhaserStepDSL>,
    pub phase: PhaseConfigDSL,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct PhaserStepDSL {
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

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(tag = "mode", rename_all = "snake_case", deny_unknown_fields)]
pub enum PhaseConfigDSL {
    Spread { spread: PhaseSpreadDSL },
    Grouped { grouped: PhaseGroupedDSL },
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct PhaseSpreadDSL {
    #[schemars(range(min = 0.0, max = 100.0))]
    pub from: f64,
    #[schemars(range(min = 0.0, max = 100.0))]
    pub to: f64,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct PhaseGroupedDSL {
    #[schemars(range(min = 1))]
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
    #[schemars(range(min = 0.0))]
    pub beat: f64,
    #[schemars(range(min = 0.000_001))]
    #[serde(skip_serializing_if = "Option::is_none")]
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
        target: AutomationTargetDSL,
        from: AnimatableValueDSL,
        to: AnimatableValueDSL,
        #[serde(skip_serializing_if = "Option::is_none")]
        easing: Option<EasingDSL>,
    },
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(tag = "scope", rename_all = "snake_case", deny_unknown_fields)]
pub enum AutomationTargetDSL {
    Global {
        parameter_id: GlobalParameterDSL,
    },
    EffectInstance {
        instance_id: String,
        parameter_id: EffectParameterDSL,
    },
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum GlobalParameterDSL {
    MasterDimmer,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum EffectParameterDSL {
    Multiplier,
    Color,
    Dimmer,
    Pan,
    Tilt,
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
    validate_phase_shapes(&value)?;
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
            migrate_group_ids(&mut value, &mut changes)?;
            migrate_automation_targets(&mut value, &mut changes)?;
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

fn migrate_automation_targets(
    value: &mut serde_json::Value,
    changes: &mut Vec<MigrationChange>,
) -> Result<(), Diagnostic> {
    let Some(events) = value
        .get_mut("timeline")
        .and_then(|timeline| timeline.get_mut("events"))
        .and_then(serde_json::Value::as_array_mut)
    else {
        return Ok(());
    };
    for (index, event) in events.iter_mut().enumerate() {
        let Some(action) = event
            .get_mut("action")
            .and_then(serde_json::Value::as_object_mut)
        else {
            continue;
        };
        if action.get("type").and_then(serde_json::Value::as_str) != Some("animate") {
            continue;
        }
        let Some(target) = action.get_mut("target") else {
            continue;
        };
        let Some(legacy_target) = target.as_str().map(str::to_owned) else {
            continue;
        };
        let structured = if legacy_target == "global.master_dimmer" {
            serde_json::json!({
                "scope": "global",
                "parameter_id": "master_dimmer"
            })
        } else if let Some(reference) = legacy_target.strip_prefix("phaser:") {
            let Some((instance_id, parameter_id)) = reference.split_once('.') else {
                return Err(legacy_target_diagnostic(index, &legacy_target));
            };
            serde_json::json!({
                "scope": "effect_instance",
                "instance_id": instance_id,
                "parameter_id": parameter_id
            })
        } else {
            return Err(legacy_target_diagnostic(index, &legacy_target));
        };
        *target = structured;
        changes.push(MigrationChange {
            code: "MIGRATION_STRUCTURE_AUTOMATION_TARGET".to_string(),
            path: format!("timeline.events[{index}].action.target"),
            message: format!("Converted legacy automation target {legacy_target:?}."),
        });
    }
    Ok(())
}

fn migrate_group_ids(
    value: &mut serde_json::Value,
    changes: &mut Vec<MigrationChange>,
) -> Result<(), Diagnostic> {
    let mut name_to_id = std::collections::HashMap::new();
    let mut ambiguous_names = std::collections::HashSet::new();
    let mut used_ids = std::collections::HashSet::new();
    if let Some(groups) = value
        .get_mut("groups")
        .and_then(serde_json::Value::as_array_mut)
    {
        for (index, group) in groups.iter_mut().enumerate() {
            let Some(group) = group.as_object_mut() else {
                continue;
            };
            let Some(name) = group
                .get("name")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
            else {
                continue;
            };
            let id = if let Some(id) = group
                .get("id")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
            {
                used_ids.insert(id.clone());
                id
            } else {
                let id = unique_migrated_id(&name, index, &mut used_ids);
                group.insert("id".to_string(), serde_json::Value::String(id.clone()));
                changes.push(MigrationChange {
                    code: "MIGRATION_ADD_GROUP_ID".to_string(),
                    path: format!("groups[{index}].id"),
                    message: format!("Added stable group ID {id:?} for {name:?}."),
                });
                id
            };
            if name_to_id.insert(name.clone(), id).is_some() {
                ambiguous_names.insert(name);
            }
        }
    }

    if let Some(phasers) = value
        .get_mut("phasers")
        .and_then(serde_json::Value::as_array_mut)
    {
        for (index, phaser) in phasers.iter_mut().enumerate() {
            let Some(target) = phaser.get_mut("target") else {
                continue;
            };
            let Some(legacy_target) = target.as_str() else {
                continue;
            };
            if ambiguous_names.contains(legacy_target) {
                return Err(Diagnostic::error(
                    crate::compiler::diagnostic::DOC_AMBIGUOUS_REFERENCE,
                    format!("phasers[{index}].target"),
                    format!("Legacy group name {legacy_target:?} matches multiple groups."),
                    "Assign unique group IDs and update this reference before migration.",
                ));
            }
            let Some(group_id) = name_to_id.get(legacy_target) else {
                continue;
            };
            if legacy_target != group_id {
                *target = serde_json::Value::String(group_id.clone());
                changes.push(MigrationChange {
                    code: "MIGRATION_REFERENCE_GROUP_ID".to_string(),
                    path: format!("phasers[{index}].target"),
                    message: format!("Updated group reference to stable ID {group_id:?}."),
                });
            }
        }
    }
    Ok(())
}

fn unique_migrated_id(
    name: &str,
    index: usize,
    used_ids: &mut std::collections::HashSet<String>,
) -> String {
    let mut base = String::new();
    let mut last_was_separator = false;
    for character in name.chars() {
        if character.is_ascii_alphanumeric() {
            base.push(character.to_ascii_lowercase());
            last_was_separator = false;
        } else if !last_was_separator && !base.is_empty() {
            base.push('-');
            last_was_separator = true;
        }
    }
    while base.ends_with('-') {
        base.pop();
    }
    if base.is_empty() {
        base = format!("group-{}", index + 1);
    }

    let mut candidate = base.clone();
    let mut suffix = 2;
    while !used_ids.insert(candidate.clone()) {
        candidate = format!("{base}-{suffix}");
        suffix += 1;
    }
    candidate
}

fn legacy_target_diagnostic(index: usize, target: &str) -> Diagnostic {
    Diagnostic::error(
        crate::compiler::diagnostic::DOC_TIMELINE_TARGET_INVALID,
        format!("timeline.events[{index}].action.target"),
        format!("Unsupported legacy automation target: {target:?}."),
        "Use a structured global or effect_instance automation target.",
    )
}

fn validate_phase_shapes(value: &serde_json::Value) -> Result<(), Diagnostic> {
    let Some(phasers) = value.get("phasers").and_then(serde_json::Value::as_array) else {
        return Ok(());
    };
    for (index, phaser) in phasers.iter().enumerate() {
        let Some(phase) = phaser.get("phase").and_then(serde_json::Value::as_object) else {
            continue;
        };
        let mode = phase.get("mode").and_then(serde_json::Value::as_str);
        let valid = match mode {
            Some("spread") => phase.contains_key("spread") && !phase.contains_key("grouped"),
            Some("grouped") => phase.contains_key("grouped") && !phase.contains_key("spread"),
            _ => false,
        };
        if !valid {
            return Err(Diagnostic::error(
                DOC_INVALID_PHASE_CONFIG,
                format!("phasers[{index}].phase"),
                "Phase mode and payload do not match.",
                "Use mode=spread with only spread, or mode=grouped with only grouped.",
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{load_document, AutomationTargetDSL, TimelineActionDefDSL, CURRENT_SCHEMA_VERSION};
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

    #[test]
    fn does_not_repair_a_malformed_current_version() {
        let source = LEGACY_DOCUMENT
            .replacen('{', "{\"schema_version\": 1,", 1)
            .replace(
                "\"groups\": []",
                "\"groups\": [{ \"name\": \"Missing ID\", \"fixtures\": [] }]",
            );
        let error = load_document(&source).expect_err("current versions must match their schema");

        assert_eq!(error.code, DOC_SCHEMA_INVALID);
        assert!(error.message.contains("missing field `id`"));
    }

    #[test]
    fn migrates_legacy_automation_paths_to_structured_references() {
        let source = LEGACY_DOCUMENT.replace(
            "\"phasers\": []",
            "\"phasers\": [], \"timeline\": { \"events\": [{ \"beat\": 0, \"duration\": 1, \"action\": { \"type\": \"animate\", \"target\": \"global.master_dimmer\", \"from\": 0, \"to\": 1 } }] }",
        );
        let loaded = load_document(&source).expect("legacy target migrates");
        let event = &loaded.document.timeline.as_ref().expect("timeline").events[0];

        assert!(matches!(
            &event.action,
            TimelineActionDefDSL::Animate {
                target: AutomationTargetDSL::Global { .. },
                ..
            }
        ));
        assert!(loaded
            .migration_report
            .changes
            .iter()
            .any(|change| change.code == "MIGRATION_STRUCTURE_AUTOMATION_TARGET"));
    }

    #[test]
    fn migrates_group_names_to_stable_ids_and_updates_references() {
        let source = LEGACY_DOCUMENT
            .replace(
                "\"groups\": []",
                "\"groups\": [{ \"name\": \"Front Wash\", \"fixtures\": [] }]",
            )
            .replace(
                "\"phasers\": []",
                "\"phasers\": [{ \"id\": \"wash\", \"name\": \"Wash\", \"target\": \"Front Wash\", \"steps\": [{ \"values\": {} }], \"phase\": { \"mode\": \"spread\", \"spread\": { \"from\": 0, \"to\": 0 } } }]",
            );
        let loaded = load_document(&source).expect("legacy group migrates");

        assert_eq!(loaded.document.groups[0].id, "front-wash");
        assert_eq!(loaded.document.groups[0].name, "Front Wash");
        assert_eq!(loaded.document.phasers[0].target, "front-wash");
        assert!(loaded
            .migration_report
            .changes
            .iter()
            .any(|change| change.code == "MIGRATION_ADD_GROUP_ID"));
    }

    #[test]
    fn rejects_ambiguous_legacy_group_references() {
        let source = LEGACY_DOCUMENT
            .replace(
                "\"groups\": []",
                "\"groups\": [{ \"name\": \"Wash\", \"fixtures\": [] }, { \"name\": \"Wash\", \"fixtures\": [] }]",
            )
            .replace(
                "\"phasers\": []",
                "\"phasers\": [{ \"id\": \"wash\", \"name\": \"Wash\", \"target\": \"Wash\", \"steps\": [{ \"values\": {} }], \"phase\": { \"mode\": \"spread\", \"spread\": { \"from\": 0, \"to\": 0 } } }]",
            );
        let error = load_document(&source).expect_err("ambiguous references must fail closed");

        assert_eq!(
            error.code,
            crate::compiler::diagnostic::DOC_AMBIGUOUS_REFERENCE
        );
        assert_eq!(error.path, "phasers[0].target");
    }
}
