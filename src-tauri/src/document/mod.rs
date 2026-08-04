use crate::compiler::diagnostic::{
    Diagnostic, DOC_INVALID_PHASE_CONFIG, DOC_INVALID_SCHEMA_VERSION, DOC_SCHEMA_INVALID,
    DOC_UNSUPPORTED_SCHEMA_VERSION,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

mod effect;
mod project;
mod project_layout;
mod project_migration;
mod project_validation;
mod timeline;
mod validation;

pub use effect::*;
pub use project::*;
pub use project_layout::*;
pub use project_migration::*;
#[cfg(test)]
pub(crate) use project_validation::tests::valid_bundle;
pub use project_validation::*;
pub use timeline::*;
pub use validation::{DocumentValidator, ValidatedShow};

pub const CURRENT_SCHEMA_VERSION: u32 = 4;

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct ShowDocumentV1 {
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
    pub meta: MetaDSL,
    pub patch: Vec<PatchV1DSL>,
    pub layout: LayoutDSL,
    pub groups: Vec<GroupDSL>,
    pub phasers: Vec<PhaserDSL>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeline: Option<TimelineDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct ShowDocumentV2 {
    #[schemars(range(min = 2, max = 2))]
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
pub struct ShowDocumentV3 {
    #[schemars(range(min = 3, max = 3))]
    pub schema_version: u32,
    pub meta: MetaDSL,
    pub patch: Vec<PatchDSL>,
    pub layout: LayoutDSL,
    pub groups: Vec<GroupDSL>,
    pub effect_definitions: Vec<EffectDefinitionDSL>,
    pub effect_instances: Vec<EffectInstanceDSL>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeline: Option<TimelineV3DSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct ShowDocumentV4 {
    #[schemars(range(min = 4, max = 4))]
    pub schema_version: u32,
    pub meta: MetaDSL,
    pub patch: Vec<PatchDSL>,
    pub layout: LayoutDSL,
    pub groups: Vec<GroupDSL>,
    pub effect_definitions: Vec<EffectDefinitionDSL>,
    pub effect_instances: Vec<EffectInstanceDSL>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeline: Option<TimelineV4DSL>,
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
pub struct PatchV1DSL {
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

    pub const fn profile_id(self) -> &'static str {
        match self {
            Self::Spot => crate::engine::profile::GENERIC_MOVING_HEAD_PROFILE_ID,
            Self::Pixel => crate::engine::profile::GENERIC_RGB_PROFILE_ID,
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

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq, Hash)]
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
    pub document: ShowDocumentV4,
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
            "Update the document to match the generated ShowDocumentV4 schema.",
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
    let mut migrated_version = match from_version {
        None => {
            let object = value
                .as_object_mut()
                .ok_or_else(top_level_object_diagnostic)?;
            object.insert("schema_version".to_string(), serde_json::Value::from(1));
            changes.push(MigrationChange {
                code: "MIGRATION_ADD_SCHEMA_VERSION".to_string(),
                path: "schema_version".to_string(),
                message: "Added schema_version 1 to a legacy document.".to_string(),
            });
            migrate_group_ids(&mut value, &mut changes)?;
            migrate_automation_targets(&mut value, &mut changes)?;
            1
        }
        Some(version @ 1..=CURRENT_SCHEMA_VERSION) => version,
        Some(version) => return Err(unsupported_schema_version(version)),
    };
    if migrated_version == 1 {
        migrate_fixture_profiles(&mut value, &mut changes)?;
        migrated_version = 2;
    }
    if migrated_version == 2 {
        migrate_phasers_to_effects(&mut value, &mut changes)?;
        migrated_version = 3;
    }
    if migrated_version == 3 {
        migrate_timeline_to_arrangement(&mut value, &mut changes)?;
        migrated_version = 4;
    }
    if migrated_version != CURRENT_SCHEMA_VERSION {
        return Err(unsupported_schema_version(migrated_version));
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

fn migrate_timeline_to_arrangement(
    value: &mut serde_json::Value,
    changes: &mut Vec<MigrationChange>,
) -> Result<(), Diagnostic> {
    let object = value
        .as_object_mut()
        .ok_or_else(top_level_object_diagnostic)?;
    let timeline = object.remove("timeline");
    if let Some(timeline) = timeline {
        let events = timeline
            .get("events")
            .and_then(serde_json::Value::as_array)
            .ok_or_else(|| {
                Diagnostic::error(
                    DOC_SCHEMA_INVALID,
                    "timeline.events",
                    "V3 timeline events must be an array.",
                    "Repair the V3 timeline before migrating it to tracks and clips.",
                )
            })?;
        let mut clips = Vec::new();
        let mut lanes: Vec<serde_json::Value> = Vec::new();
        for (index, event) in events.iter().enumerate() {
            let beat = event
                .get("beat")
                .and_then(serde_json::Value::as_f64)
                .unwrap_or(0.0);
            let start_tick =
                quantize_v3_beat(beat, format!("timeline.events[{index}].beat"), changes);
            let duration = event.get("duration").and_then(serde_json::Value::as_f64);
            let action = event
                .get("action")
                .and_then(serde_json::Value::as_object)
                .ok_or_else(|| {
                    Diagnostic::error(
                        DOC_SCHEMA_INVALID,
                        format!("timeline.events[{index}].action"),
                        "V3 timeline action must be an object.",
                        "Repair the V3 action before migration.",
                    )
                })?;
            match action.get("type").and_then(serde_json::Value::as_str) {
                Some("effect") => {
                    let instance_id = action
                        .get("instance_id")
                        .and_then(serde_json::Value::as_str)
                        .ok_or_else(|| {
                            Diagnostic::error(
                                DOC_SCHEMA_INVALID,
                                format!("timeline.events[{index}].action.instance_id"),
                                "V3 effect action requires instance_id.",
                                "Repair the V3 action before migration.",
                            )
                        })?;
                    let duration_tick = duration.map_or_else(
                        || u32::MAX.saturating_sub(start_tick).max(1),
                        |duration| {
                            quantize_v3_beat(
                                duration,
                                format!("timeline.events[{index}].duration"),
                                changes,
                            )
                            .max(1)
                        },
                    );
                    clips.push(serde_json::json!({
                        "id": format!("clip-{index}"),
                        "instance_id": instance_id,
                        "start_tick": start_tick,
                        "duration_tick": duration_tick,
                        "source_offset_tick": 0,
                        "playback": "once",
                        "layer": i32::try_from(index).unwrap_or(i32::MAX)
                    }));
                }
                Some("animate") => {
                    let target = action.get("target").cloned().ok_or_else(|| {
                        Diagnostic::error(
                            DOC_SCHEMA_INVALID,
                            format!("timeline.events[{index}].action.target"),
                            "V3 animate action requires a target.",
                            "Repair the V3 action before migration.",
                        )
                    })?;
                    let from = migrate_animatable_value(
                        action.get("from"),
                        format!("timeline.events[{index}].action.from"),
                    )?;
                    let to = migrate_animatable_value(
                        action.get("to"),
                        format!("timeline.events[{index}].action.to"),
                    )?;
                    let interpolation = action
                        .get("easing")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("linear");
                    let mut keyframes = Vec::new();
                    if let Some(duration) = duration {
                        let duration_tick = quantize_v3_beat(
                            duration,
                            format!("timeline.events[{index}].duration"),
                            changes,
                        )
                        .max(1);
                        keyframes.push(serde_json::json!({
                            "id": format!("keyframe-{index}-start"),
                            "time_tick": start_tick,
                            "value": from,
                            "interpolation": interpolation
                        }));
                        keyframes.push(serde_json::json!({
                            "id": format!("keyframe-{index}-end"),
                            "time_tick": start_tick.saturating_add(duration_tick),
                            "value": to,
                            "interpolation": "hold"
                        }));
                    } else {
                        keyframes.push(serde_json::json!({
                            "id": format!("keyframe-{index}"),
                            "time_tick": start_tick,
                            "value": to,
                            "interpolation": "hold"
                        }));
                    }
                    if let Some(existing) = lanes
                        .iter_mut()
                        .find(|lane| lane.get("target") == Some(&target))
                    {
                        existing
                            .get_mut("keyframes")
                            .and_then(serde_json::Value::as_array_mut)
                            .expect("migrated lane keyframes")
                            .extend(keyframes);
                        changes.push(MigrationChange {
                            code: "MIGRATION_MERGE_AUTOMATION_LANE".to_string(),
                            path: format!("timeline.events[{index}].action.target"),
                            message: "Merged sequential V3 automation events into one typed lane."
                                .to_string(),
                        });
                    } else {
                        lanes.push(serde_json::json!({
                            "id": format!("automation-{index}"),
                            "target": target,
                            "keyframes": keyframes
                        }));
                    }
                }
                _ => {
                    return Err(Diagnostic::error(
                        DOC_SCHEMA_INVALID,
                        format!("timeline.events[{index}].action.type"),
                        "V3 timeline action has an unsupported type.",
                        "Use effect or animate before migration.",
                    ));
                }
            }
        }
        for lane in &mut lanes {
            let keyframes = lane
                .get_mut("keyframes")
                .and_then(serde_json::Value::as_array_mut)
                .expect("migrated lane keyframes");
            keyframes.sort_by_key(|keyframe| {
                keyframe
                    .get("time_tick")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or(0)
            });
            let mut deduplicated: Vec<serde_json::Value> = Vec::with_capacity(keyframes.len());
            for keyframe in keyframes.drain(..) {
                let time_tick = keyframe
                    .get("time_tick")
                    .and_then(serde_json::Value::as_u64);
                if deduplicated.last().and_then(|previous| {
                    previous
                        .get("time_tick")
                        .and_then(serde_json::Value::as_u64)
                }) == time_tick
                {
                    deduplicated.pop();
                }
                deduplicated.push(keyframe);
            }
            *keyframes = deduplicated;
        }
        let mut tracks = Vec::new();
        if !clips.is_empty() {
            tracks.push(serde_json::json!({
                "id": "effects",
                "name": "Effects",
                "overlap_policy": "layer",
                "clips": clips,
                "automation_lanes": []
            }));
        }
        if !lanes.is_empty() {
            tracks.push(serde_json::json!({
                "id": "automation",
                "name": "Automation",
                "overlap_policy": "layer",
                "clips": [],
                "automation_lanes": lanes
            }));
        }
        object.insert(
            "timeline".to_string(),
            serde_json::json!({
                "ppq": DOCUMENT_DEFAULT_PPQ,
                "tempo_map": { "points": [{ "time_tick": 0, "bpm": 120.0 }] },
                "tracks": tracks
            }),
        );
        changes.push(MigrationChange {
            code: "MIGRATION_TIMELINE_V3_TO_V4".to_string(),
            path: "timeline".to_string(),
            message: "Converted V3 events to integer EffectClips and AutomationLanes.".to_string(),
        });
    }
    object.insert("schema_version".to_string(), serde_json::Value::from(4));
    changes.push(MigrationChange {
        code: "MIGRATION_SCHEMA_V3_TO_V4".to_string(),
        path: "schema_version".to_string(),
        message: "Upgraded the show document from schema version 3 to 4.".to_string(),
    });
    Ok(())
}

fn quantize_v3_beat(beat: f64, path: String, changes: &mut Vec<MigrationChange>) -> u32 {
    let raw = beat.max(0.0) * f64::from(DOCUMENT_DEFAULT_PPQ);
    let tick = raw.round().clamp(0.0, f64::from(u32::MAX)) as u32;
    if (raw - f64::from(tick)).abs() > 1e-9 {
        changes.push(MigrationChange {
            code: "MIGRATION_QUANTIZE_MUSICAL_TIME".to_string(),
            path,
            message: format!("Quantized beat {beat} to integer tick {tick}."),
        });
    }
    tick
}

fn migrate_animatable_value(
    value: Option<&serde_json::Value>,
    path: String,
) -> Result<serde_json::Value, Diagnostic> {
    match value {
        Some(serde_json::Value::Number(number)) => Ok(serde_json::json!({
            "type": "scalar",
            "value": number
        })),
        Some(serde_json::Value::String(color)) => Ok(serde_json::json!({
            "type": "color",
            "value": color
        })),
        _ => Err(Diagnostic::error(
            DOC_SCHEMA_INVALID,
            path,
            "V3 animation value must be a finite number or color string.",
            "Repair the animation value before migration.",
        )),
    }
}

fn migrate_phasers_to_effects(
    value: &mut serde_json::Value,
    changes: &mut Vec<MigrationChange>,
) -> Result<(), Diagnostic> {
    let object = value
        .as_object_mut()
        .ok_or_else(top_level_object_diagnostic)?;
    let phasers = object
        .remove("phasers")
        .and_then(|value| value.as_array().cloned())
        .ok_or_else(|| {
            Diagnostic::error(
                DOC_SCHEMA_INVALID,
                "phasers",
                "V2 phasers must be an array.",
                "Repair the V2 document before migrating it to EffectDefinition/Instance.",
            )
        })?;

    let mut definitions = Vec::with_capacity(phasers.len());
    let mut instances = Vec::with_capacity(phasers.len());
    for (index, phaser) in phasers.iter().enumerate() {
        let phaser = phaser.as_object().ok_or_else(|| {
            Diagnostic::error(
                DOC_SCHEMA_INVALID,
                format!("phasers[{index}]"),
                "V2 phaser must be an object.",
                "Repair the V2 phaser before migration.",
            )
        })?;
        let string_field = |field: &str| {
            phaser
                .get(field)
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
                .ok_or_else(|| {
                    Diagnostic::error(
                        DOC_SCHEMA_INVALID,
                        format!("phasers[{index}].{field}"),
                        format!("V2 phaser {field} must be a string."),
                        "Repair the V2 phaser before migration.",
                    )
                })
        };
        let id = string_field("id")?;
        let name = string_field("name")?;
        let target = string_field("target")?;
        let definition_id = format!("legacy.{id}");
        let speed = phaser
            .get("multiplier")
            .and_then(serde_json::Value::as_f64)
            .unwrap_or(1.0);
        let steps = phaser
            .get("steps")
            .cloned()
            .unwrap_or_else(|| serde_json::Value::Array(Vec::new()));
        let position_behavior_changed = steps.as_array().is_some_and(|steps| {
            steps.iter().any(|step| {
                step.get("values").is_some_and(|values| {
                    values.get("pan").is_some() || values.get("tilt").is_some()
                })
            })
        });
        let phase = phaser.get("phase").and_then(serde_json::Value::as_object);
        let (from, to, group_size) = match phase
            .and_then(|phase| phase.get("mode"))
            .and_then(serde_json::Value::as_str)
        {
            Some("grouped") => {
                let grouped = phase
                    .and_then(|phase| phase.get("grouped"))
                    .and_then(serde_json::Value::as_object);
                let spread = grouped
                    .and_then(|grouped| grouped.get("spread"))
                    .and_then(serde_json::Value::as_array);
                (
                    spread
                        .and_then(|spread| spread.first())
                        .and_then(serde_json::Value::as_f64)
                        .unwrap_or(0.0)
                        / 100.0,
                    spread
                        .and_then(|spread| spread.get(1))
                        .and_then(serde_json::Value::as_f64)
                        .unwrap_or(0.0)
                        / 100.0,
                    grouped
                        .and_then(|grouped| grouped.get("group_size"))
                        .and_then(serde_json::Value::as_u64),
                )
            }
            _ => {
                let spread = phase
                    .and_then(|phase| phase.get("spread"))
                    .and_then(serde_json::Value::as_object);
                (
                    spread
                        .and_then(|spread| spread.get("from"))
                        .and_then(serde_json::Value::as_f64)
                        .unwrap_or(0.0)
                        / 100.0,
                    spread
                        .and_then(|spread| spread.get("to"))
                        .and_then(serde_json::Value::as_f64)
                        .unwrap_or(0.0)
                        / 100.0,
                    None,
                )
            }
        };
        let required_attributes = migrated_required_attributes(&steps);

        definitions.push(serde_json::json!({
            "id": definition_id,
            "name": name,
            "revision": 1,
            "source": "project_local",
            "parameters": migrated_common_parameters(speed),
            "graph": { "nodes": [
                { "type": "time", "id": "time" },
                {
                    "type": "spatial_phase",
                    "id": "spatial",
                    "input": { "node_id": "time", "port": "scalar" },
                    "basis": "index",
                    "from": from,
                    "to": to,
                    "wrap": true,
                    "group_size": group_size
                },
                {
                    "type": "step_sequence",
                    "id": "sequence",
                    "phase": { "node_id": "spatial", "port": "scalar" },
                    "steps": steps
                },
                {
                    "type": "attribute_writer",
                    "id": "output",
                    "input": { "node_id": "sequence", "port": "attribute_set" },
                    "mask": null
                }
            ]},
            "catalog": {
                "mood": [],
                "energy": 0.5,
                "density": 0.5,
                "motion": "pulse",
                "colorfulness": 0.5,
                "strobe_risk": "none",
                "required_attributes": required_attributes
            }
        }));
        instances.push(serde_json::json!({
            "id": id,
            "definition_id": format!("legacy.{id}"),
            "definition_revision": 1,
            "target_group_id": target,
            "parameter_overrides": {},
            "seed": format!("{:016x}", crate::engine::effect::EffectInstance::stable_seed(&id))
        }));
        changes.push(MigrationChange {
            code: "MIGRATION_PHASER_TO_EFFECT".to_string(),
            path: format!("effect_instances[{index}]"),
            message: format!("Converted Phaser {id:?} to EffectDefinition/Instance."),
        });
        if position_behavior_changed {
            changes.push(MigrationChange {
                code: "MIGRATION_ENABLE_POSITION_ATTRIBUTES".to_string(),
                path: format!("effect_definitions[{index}].graph"),
                message: format!(
                    "Phaser {id:?} pan/tilt values now write typed position attributes; older runtimes ignored them."
                ),
            });
        }
    }

    object.insert(
        "effect_definitions".to_string(),
        serde_json::Value::Array(definitions),
    );
    object.insert(
        "effect_instances".to_string(),
        serde_json::Value::Array(instances),
    );
    migrate_v2_timeline_to_effects(object, changes);
    object.insert("schema_version".to_string(), serde_json::Value::from(3));
    changes.push(MigrationChange {
        code: "MIGRATION_SCHEMA_V2_TO_V3".to_string(),
        path: "schema_version".to_string(),
        message: "Upgraded the show document from schema version 2 to 3.".to_string(),
    });
    Ok(())
}

fn migrated_common_parameters(speed: f64) -> serde_json::Value {
    serde_json::json!([
        migrated_scalar_parameter("speed", "Speed", speed, [0.01, 64.0], "multiplier", "slider"),
        migrated_scalar_parameter("phase", "Phase", 0.0, [-1.0, 1.0], "cycles", "slider"),
        migrated_scalar_parameter("width", "Width", 100.0, [0.0, 100.0], "percent", "slider"),
        migrated_scalar_parameter("transition", "Transition", 100.0, [0.0, 100.0], "percent", "slider"),
        migrated_scalar_parameter("intensity", "Intensity", 1.0, [0.0, 1.0], "normalized", "slider"),
        {
            "id": "color", "name": "Color", "value_type": "color",
            "default_value": { "type": "color", "value": "#ffffff" },
            "unit": "color", "ui_hint": "color", "automation": "continuous"
        },
        {
            "id": "direction", "name": "Direction", "value_type": "direction",
            "default_value": { "type": "direction", "value": "forward" },
            "unit": "direction", "ui_hint": "segmented", "automation": "discrete"
        },
        migrated_scalar_parameter("pan", "Pan", 0.0, [-540.0, 540.0], "degrees", "angle"),
        migrated_scalar_parameter("tilt", "Tilt", 0.0, [-270.0, 270.0], "degrees", "angle")
    ])
}

fn migrated_scalar_parameter(
    id: &str,
    name: &str,
    default_value: f64,
    range: [f64; 2],
    unit: &str,
    ui_hint: &str,
) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "name": name,
        "value_type": "scalar",
        "default_value": { "type": "scalar", "value": default_value },
        "range": range,
        "unit": unit,
        "ui_hint": ui_hint,
        "automation": "continuous"
    })
}

fn migrated_required_attributes(steps: &serde_json::Value) -> Vec<&'static str> {
    let mut attributes = vec!["intensity", "color.rgb"];
    for values in steps
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|step| step.get("values").and_then(serde_json::Value::as_object))
    {
        if values.contains_key("pan") && !attributes.contains(&"position.pan") {
            attributes.push("position.pan");
        }
        if values.contains_key("tilt") && !attributes.contains(&"position.tilt") {
            attributes.push("position.tilt");
        }
    }
    attributes
}

fn migrate_v2_timeline_to_effects(
    object: &mut serde_json::Map<String, serde_json::Value>,
    changes: &mut Vec<MigrationChange>,
) {
    let Some(events) = object
        .get_mut("timeline")
        .and_then(|timeline| timeline.get_mut("events"))
        .and_then(serde_json::Value::as_array_mut)
    else {
        return;
    };
    for (index, event) in events.iter_mut().enumerate() {
        let Some(action) = event
            .get_mut("action")
            .and_then(serde_json::Value::as_object_mut)
        else {
            continue;
        };
        match action.get("type").and_then(serde_json::Value::as_str) {
            Some("phaser") => {
                if let Some(instance_id) = action.remove("phaser") {
                    action.insert(
                        "type".to_string(),
                        serde_json::Value::String("effect".to_string()),
                    );
                    action.insert("instance_id".to_string(), instance_id);
                    changes.push(MigrationChange {
                        code: "MIGRATION_TIMELINE_EFFECT_REFERENCE".to_string(),
                        path: format!("timeline.events[{index}].action"),
                        message: "Converted Phaser action to EffectInstance reference.".to_string(),
                    });
                }
            }
            Some("animate") => {
                let Some(parameter) = action
                    .get_mut("target")
                    .and_then(serde_json::Value::as_object_mut)
                    .and_then(|target| target.get_mut("parameter_id"))
                else {
                    continue;
                };
                let mapped = match parameter.as_str() {
                    Some("multiplier") => Some("speed"),
                    Some("dimmer") => Some("intensity"),
                    _ => None,
                };
                if let Some(mapped) = mapped {
                    *parameter = serde_json::Value::String(mapped.to_string());
                }
            }
            _ => {}
        }
    }
}

fn migrate_fixture_profiles(
    value: &mut serde_json::Value,
    changes: &mut Vec<MigrationChange>,
) -> Result<(), Diagnostic> {
    let patch = value
        .get_mut("patch")
        .and_then(serde_json::Value::as_array_mut)
        .ok_or_else(|| {
            Diagnostic::error(
                DOC_SCHEMA_INVALID,
                "patch",
                "V1 patch must be an array.",
                "Repair the V1 document before migrating it to profile-backed patch entries.",
            )
        })?;
    for (index, entry) in patch.iter_mut().enumerate() {
        let Some(entry) = entry.as_object_mut() else {
            continue;
        };
        let Some(legacy_type) = entry
            .remove("type")
            .and_then(|value| value.as_str().map(str::to_owned))
        else {
            continue;
        };
        let profile_id = match legacy_type.as_str() {
            "pixel" => crate::engine::profile::GENERIC_RGB_PROFILE_ID,
            "spot" => crate::engine::profile::GENERIC_MOVING_HEAD_PROFILE_ID,
            _ => {
                return Err(Diagnostic::error(
                    DOC_SCHEMA_INVALID,
                    format!("patch[{index}].type"),
                    format!("Unsupported V1 fixture type: {legacy_type:?}."),
                    "Use pixel or spot in V1, or select a valid profile_id in V2.",
                ));
            }
        };
        entry.insert(
            "profile_id".to_string(),
            serde_json::Value::String(profile_id.to_string()),
        );
        changes.push(MigrationChange {
            code: "MIGRATION_PATCH_PROFILE".to_string(),
            path: format!("patch[{index}].profile_id"),
            message: format!("Mapped V1 fixture type {legacy_type:?} to {profile_id:?}."),
        });
    }
    let object = value
        .as_object_mut()
        .ok_or_else(top_level_object_diagnostic)?;
    object.insert("schema_version".to_string(), serde_json::Value::from(2));
    changes.push(MigrationChange {
        code: "MIGRATION_SCHEMA_V1_TO_V2".to_string(),
        path: "schema_version".to_string(),
        message: "Upgraded the show document from schema version 1 to 2.".to_string(),
    });
    Ok(())
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
    use super::{load_document, AutomationTargetV3DSL, CURRENT_SCHEMA_VERSION};
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
        assert_eq!(loaded.migration_report.changes.len(), 4);
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
        let loaded = load_document(LEGACY_DOCUMENT).expect("baseline migration");
        let mut value = serde_json::to_value(loaded.document).expect("document JSON");
        value["groups"] = serde_json::json!([{ "name": "Missing ID", "fixtures": [] }]);
        let source = serde_json::to_string(&value).expect("malformed current document");
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
        let lane =
            &loaded.document.timeline.as_ref().expect("timeline").tracks[0].automation_lanes[0];

        assert!(matches!(&lane.target, AutomationTargetV3DSL::Global { .. }));
        assert!(loaded
            .migration_report
            .changes
            .iter()
            .any(|change| change.code == "MIGRATION_STRUCTURE_AUTOMATION_TARGET"));
    }

    #[test]
    fn migrates_v1_fixture_types_to_v2_profiles() {
        let source = LEGACY_DOCUMENT
            .replacen('{', "{\"schema_version\": 1,", 1)
            .replace(
                "\"patch\": []",
                "\"patch\": [{ \"type\": \"pixel\", \"id_range\": [1, 1] }, { \"type\": \"spot\", \"id_range\": [2, 2] }]",
            );
        let loaded = load_document(&source).expect("V1 fixture types migrate");

        assert_eq!(loaded.document.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(loaded.document.patch[0].profile_id, "generic-rgb");
        assert_eq!(loaded.document.patch[1].profile_id, "generic-moving-head");
        assert_eq!(
            loaded
                .migration_report
                .changes
                .iter()
                .filter(|change| change.code == "MIGRATION_PATCH_PROFILE")
                .count(),
            2
        );
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
        assert_eq!(
            loaded.document.effect_instances[0].target_group_id,
            "front-wash"
        );
        assert_eq!(loaded.document.effect_definitions[0].id, "legacy.wash");
        assert_eq!(
            loaded.document.effect_instances[0].seed,
            format!(
                "{:016x}",
                crate::engine::effect::EffectInstance::stable_seed("wash")
            )
        );
        assert!(loaded
            .migration_report
            .changes
            .iter()
            .any(|change| change.code == "MIGRATION_ADD_GROUP_ID"));
    }

    #[test]
    fn migrates_v2_phasers_and_multiplier_to_v3_effect_identity() {
        let source = LEGACY_DOCUMENT
            .replacen('{', "{\"schema_version\": 2,", 1)
            .replace(
                "\"phasers\": []",
                r##""phasers": [{
                  "id": "pulse", "name": "Pulse", "target": "all", "multiplier": 2,
                  "steps": [{ "values": { "color": "#ffffff", "dimmer": 1, "pan": 30, "tilt": -15 } }],
                  "phase": { "mode": "spread", "spread": { "from": 0, "to": 100 } }
                }],
                "timeline": { "events": [
                  { "beat": 0, "duration": 2, "action": { "type": "phaser", "phaser": "pulse" } },
                  { "beat": 0, "duration": 2, "action": {
                    "type": "animate",
                    "target": { "scope": "effect_instance", "instance_id": "pulse", "parameter_id": "multiplier" },
                    "from": 1, "to": 2
                  } },
                  { "beat": 2, "duration": 2, "action": {
                    "type": "animate",
                    "target": { "scope": "effect_instance", "instance_id": "pulse", "parameter_id": "multiplier" },
                    "from": 2, "to": 1
                  } }
                ] }"##,
            )
            .replace(
                "\"groups\": []",
                "\"groups\": [{ \"id\": \"all\", \"name\": \"All\", \"fixtures\": [] }]",
            );
        let loaded = load_document(&source).expect("V2 Phaser migrates to V3 effects");

        assert_eq!(loaded.document.effect_definitions[0].id, "legacy.pulse");
        assert_eq!(loaded.document.effect_instances[0].id, "pulse");
        assert_eq!(
            loaded.document.effect_instances[0].definition_id,
            "legacy.pulse"
        );
        let timeline = loaded.document.timeline.as_ref().expect("timeline");
        assert_eq!(timeline.ppq, 960);
        assert_eq!(timeline.tracks[0].clips[0].instance_id, "pulse");
        assert!(matches!(
            timeline.tracks[1].automation_lanes[0].target,
            AutomationTargetV3DSL::EffectInstance { ref parameter_id, .. }
                if parameter_id == "speed"
        ));
        assert_eq!(timeline.tracks[1].automation_lanes.len(), 1);
        assert_eq!(timeline.tracks[1].automation_lanes[0].keyframes.len(), 3);
        assert!(loaded
            .migration_report
            .changes
            .iter()
            .any(|change| change.code == "MIGRATION_PHASER_TO_EFFECT"));
        assert!(loaded
            .migration_report
            .changes
            .iter()
            .any(|change| change.code == "MIGRATION_ENABLE_POSITION_ATTRIBUTES"));
        assert!(loaded
            .migration_report
            .changes
            .iter()
            .any(|change| change.code == "MIGRATION_MERGE_AUTOMATION_LANE"));
    }

    #[test]
    fn quantizes_v3_beats_and_reports_the_exact_tick() {
        let source = r#"{
          "schema_version": 3,
          "meta": { "name": "Quantized timeline" },
          "patch": [],
          "layout": { "type": "generator", "generator": { "shape": "custom", "fixtures": [] } },
          "groups": [],
          "effect_definitions": [],
          "effect_instances": [],
          "timeline": { "events": [{
            "beat": 0.333333,
            "duration": 0.666667,
            "action": {
              "type": "animate",
              "target": { "scope": "global", "parameter_id": "master_dimmer" },
              "from": 0,
              "to": 1
            }
          }] }
        }"#;
        let loaded = load_document(source).expect("V3 timeline migrates");
        let timeline = loaded.document.timeline.expect("timeline");
        let keyframes = &timeline.tracks[0].automation_lanes[0].keyframes;

        assert_eq!(keyframes[0].time_tick, 320);
        assert_eq!(keyframes[1].time_tick, 960);
        assert!(loaded.migration_report.changes.iter().any(|change| {
            change.code == "MIGRATION_QUANTIZE_MUSICAL_TIME"
                && change.path == "timeline.events[0].beat"
                && change.message.contains("tick 320")
        }));
        assert!(loaded
            .migration_report
            .changes
            .iter()
            .any(|change| change.code == "MIGRATION_SCHEMA_V3_TO_V4"));
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
