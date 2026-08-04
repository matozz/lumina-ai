use super::{
    ClipPlaybackDSL, EffectCatalogDSL, EffectGraphDSL, EffectSourceDSL, GlobalParameterDSL,
    GroupDSL, KeyframeDSL, LayoutDSL, ParameterDefinitionDSL, ParameterValueDSL, PatchDSL,
    TempoMapDSL,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const PROJECT_BUNDLE_SCHEMA_VERSION: u32 = 1;
pub const PROJECT_MANIFEST_SCHEMA_VERSION: u32 = 1;
pub const STAGE_DOCUMENT_SCHEMA_VERSION: u32 = 1;
pub const EFFECT_DEFINITION_SCHEMA_VERSION: u32 = 1;
pub const CUE_DEFINITION_SCHEMA_VERSION: u32 = 1;
pub const ARRANGEMENT_DOCUMENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, PartialEq, Eq, Hash)]
#[serde(deny_unknown_fields)]
pub struct AssetRef {
    pub id: String,
    #[schemars(range(min = 1))]
    pub revision: u32,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct ProjectManifest {
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
    pub project_id: String,
    #[schemars(range(min = 1))]
    pub revision: u32,
    pub name: String,
    pub stage_ref: AssetRef,
    pub effect_refs: Vec<AssetRef>,
    pub cue_refs: Vec<AssetRef>,
    pub arrangement_refs: Vec<AssetRef>,
    pub active_arrangement_id: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct StageDocument {
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
    pub id: String,
    #[schemars(range(min = 1))]
    pub revision: u32,
    pub name: String,
    pub patch: Vec<PatchDSL>,
    pub layout: LayoutDSL,
    pub groups: Vec<GroupDSL>,
    pub target_sets: Vec<TargetSetDefinition>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TargetSetDefinition {
    pub id: String,
    pub name: String,
    pub selector: TargetSetSelector,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub weights: Vec<TargetSetWeight>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum TargetSetSelector {
    All,
    Rows {
        indices: Vec<u32>,
    },
    Columns {
        indices: Vec<u32>,
    },
    GridZones {
        #[schemars(range(min = 1))]
        rows: u32,
        #[schemars(range(min = 1))]
        columns: u32,
        zones: Vec<GridZone>,
    },
    Checkerboard {
        parity: CheckerboardParity,
    },
    FixtureIds {
        fixture_ids: Vec<u32>,
    },
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq, Hash)]
#[serde(deny_unknown_fields)]
pub struct GridZone {
    pub row: u32,
    pub column: u32,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CheckerboardParity {
    Even,
    Odd,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(deny_unknown_fields)]
pub struct TargetSetWeight {
    pub fixture_id: u32,
    #[schemars(range(min = 0.0, max = 1.0))]
    pub weight: f32,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct EffectDefinitionDocument {
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    #[schemars(range(min = 1))]
    pub revision: u32,
    pub source: EffectSourceDSL,
    pub parameters: Vec<ParameterDefinitionDSL>,
    pub graph: EffectGraphDSL,
    pub catalog: EffectCatalogDSL,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, PartialEq, Eq, Hash)]
#[serde(deny_unknown_fields)]
pub struct TargetSetRef {
    pub stage_id: String,
    #[schemars(range(min = 1))]
    pub stage_revision: u32,
    pub target_set_id: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct CueDefinition {
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
    pub id: String,
    #[schemars(range(min = 1))]
    pub revision: u32,
    pub name: String,
    pub compatible_stage_ref: AssetRef,
    #[schemars(range(min = 1))]
    pub nominal_length_ticks: u32,
    pub layers: Vec<CueLayer>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub automation_lanes: Vec<CueAutomationLane>,
    pub trigger_policy: CueTriggerPolicy,
    pub capability_summary: CueCapabilitySummary,
    pub risk_summary: CueRiskSummary,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct CueLayer {
    pub id: String,
    pub effect_ref: AssetRef,
    pub target_set_ref: TargetSetRef,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub parameter_overrides: BTreeMap<String, ParameterValueDSL>,
    pub phase: f64,
    pub seed: String,
    #[serde(default)]
    pub layer: i32,
    #[serde(default)]
    pub priority: i32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mix_overrides: Vec<CueMixOverride>,
    pub trigger_policy: CueTriggerPolicy,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct CueMixOverride {
    pub attribute_id: String,
    pub policy: MixPolicy,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MixPolicy {
    Htp,
    Ltp,
    Add,
    Multiply,
    Mask,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(deny_unknown_fields)]
pub struct CueTriggerPolicy {
    pub mode: CueTriggerMode,
    pub quantize: CueQuantize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub one_shot_ticks: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CueTriggerMode {
    Timeline,
    Toggle,
    Momentary,
    OneShot,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CueQuantize {
    Off,
    Beat,
    Bar,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct CueAutomationLane {
    pub id: String,
    pub target: CueAutomationTarget,
    pub keyframes: Vec<KeyframeDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, PartialEq, Eq, Hash)]
#[serde(deny_unknown_fields)]
pub struct CueAutomationTarget {
    pub layer_id: String,
    pub parameter_id: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct CueCapabilitySummary {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub required_attributes: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct CueRiskSummary {
    pub strobe_risk: super::StrobeRiskDSL,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct ArrangementDocument {
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
    pub id: String,
    #[schemars(range(min = 1))]
    pub revision: u32,
    pub name: String,
    #[schemars(range(min = 1))]
    pub ppq: u32,
    pub tempo_map: TempoMapDSL,
    pub time_signatures: Vec<TimeSignaturePoint>,
    #[schemars(range(min = 1))]
    pub length_ticks: u32,
    pub tracks: Vec<CueTrack>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub markers: Vec<ArrangementMarker>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TimeSignaturePoint {
    pub time_tick: u32,
    #[schemars(range(min = 1, max = 32))]
    pub numerator: u8,
    #[schemars(range(min = 1, max = 32))]
    pub denominator: u8,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct CueTrack {
    pub id: String,
    pub name: String,
    pub overlap_policy: super::OverlapPolicyDSL,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub clips: Vec<CueClip>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub automation_lanes: Vec<ArrangementAutomationLane>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct CueClip {
    pub id: String,
    pub cue_ref: AssetRef,
    pub start_tick: u32,
    #[schemars(range(min = 1))]
    pub duration_tick: u32,
    #[serde(default)]
    pub source_offset_tick: u32,
    #[serde(default)]
    pub playback: ClipPlaybackDSL,
    #[serde(default)]
    pub layer: i32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub layer_overrides: Vec<CueLayerOverride>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct CueLayerOverride {
    pub layer_id: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub parameter_overrides: BTreeMap<String, ParameterValueDSL>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mix_overrides: Vec<CueMixOverride>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct ArrangementAutomationLane {
    pub id: String,
    pub target: ArrangementAutomationTarget,
    pub keyframes: Vec<KeyframeDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, PartialEq, Eq, Hash)]
#[serde(tag = "scope", rename_all = "snake_case", deny_unknown_fields)]
pub enum ArrangementAutomationTarget {
    Global {
        parameter_id: GlobalParameterDSL,
    },
    CueLayer {
        clip_id: String,
        layer_id: String,
        parameter_id: String,
    },
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct ArrangementMarker {
    pub id: String,
    pub time_tick: u32,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct ProjectBundle {
    #[schemars(range(min = 1, max = 1))]
    pub schema_version: u32,
    pub manifest: ProjectManifest,
    pub stages: Vec<StageDocument>,
    pub effects: Vec<EffectDefinitionDocument>,
    pub cues: Vec<CueDefinition>,
    pub arrangements: Vec<ArrangementDocument>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn arrangement_contract_references_cues_without_embedding_other_assets() {
        let arrangement: ArrangementDocument = serde_json::from_value(json!({
            "schema_version": 1,
            "id": "house-128",
            "revision": 1,
            "name": "House 128",
            "ppq": 960,
            "tempo_map": { "points": [{ "time_tick": 0, "bpm": 128.0 }] },
            "time_signatures": [{ "time_tick": 0, "numerator": 4, "denominator": 4 }],
            "length_ticks": 30720,
            "tracks": [{
                "id": "cues",
                "name": "Cues",
                "overlap_policy": "layer",
                "clips": [{
                    "id": "clip-1",
                    "cue_ref": { "id": "pulse-gradient", "revision": 3 },
                    "start_tick": 0,
                    "duration_tick": 3840
                }]
            }]
        }))
        .expect("independent arrangement contract");

        assert_eq!(arrangement.tracks[0].clips[0].cue_ref.revision, 3);
        let serialized = serde_json::to_value(arrangement).expect("arrangement serializes");
        assert!(serialized.get("layout").is_none());
        assert!(serialized.get("effect_definitions").is_none());
        assert!(serialized.get("cues").is_none());
    }

    #[test]
    fn asset_contracts_reject_unknown_fields_and_latest_references() {
        let unknown = serde_json::from_value::<AssetRef>(json!({
            "id": "pulse",
            "revision": 1,
            "latest": true
        }));
        assert!(unknown.is_err());

        let textual_revision = serde_json::from_value::<AssetRef>(json!({
            "id": "pulse",
            "revision": "latest"
        }));
        assert!(textual_revision.is_err());
    }

    #[test]
    fn effect_document_has_no_stage_or_timeline_ownership() {
        let schema = schemars::schema_for!(EffectDefinitionDocument);
        let value = serde_json::to_value(schema).expect("effect schema serializes");
        let properties = value
            .get("properties")
            .and_then(serde_json::Value::as_object)
            .expect("effect properties");

        assert!(!properties.contains_key("target_group_id"));
        assert!(!properties.contains_key("target_set_ref"));
        assert!(!properties.contains_key("timeline"));
    }

    #[test]
    fn schema_versions_are_independent_and_start_at_one() {
        assert_eq!(PROJECT_BUNDLE_SCHEMA_VERSION, 1);
        assert_eq!(PROJECT_MANIFEST_SCHEMA_VERSION, 1);
        assert_eq!(STAGE_DOCUMENT_SCHEMA_VERSION, 1);
        assert_eq!(EFFECT_DEFINITION_SCHEMA_VERSION, 1);
        assert_eq!(CUE_DEFINITION_SCHEMA_VERSION, 1);
        assert_eq!(ARRANGEMENT_DOCUMENT_SCHEMA_VERSION, 1);
    }
}
