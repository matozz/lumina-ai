use super::{AutomationTargetDSL, ParameterValueDSL};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const DOCUMENT_DEFAULT_PPQ: u32 = 960;

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TimelineV1DSL {
    #[schemars(range(min = 1))]
    pub ppq: u32,
    pub tempo_map: TempoMapDSL,
    pub tracks: Vec<TimelineTrackDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TempoMapDSL {
    pub points: Vec<TempoPointDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TempoPointDSL {
    pub time_tick: u32,
    #[schemars(range(min = 1.0, max = 1000.0))]
    pub bpm: f64,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TimelineTrackDSL {
    pub id: String,
    pub name: String,
    pub overlap_policy: OverlapPolicyDSL,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub clips: Vec<EffectClipDSL>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub automation_lanes: Vec<AutomationLaneDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OverlapPolicyDSL {
    Layer,
    Replace,
    Reject,
    Crossfade,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct EffectClipDSL {
    pub id: String,
    pub instance_id: String,
    pub start_tick: u32,
    #[schemars(range(min = 1))]
    pub duration_tick: u32,
    #[serde(default)]
    pub source_offset_tick: u32,
    #[serde(default)]
    pub playback: ClipPlaybackDSL,
    #[serde(default)]
    pub layer: i32,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ClipPlaybackDSL {
    #[default]
    Once,
    Loop,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct AutomationLaneDSL {
    pub id: String,
    pub target: AutomationTargetDSL,
    pub keyframes: Vec<KeyframeDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct KeyframeDSL {
    pub id: String,
    pub time_tick: u32,
    pub value: ParameterValueDSL,
    pub interpolation: KeyframeInterpolationDSL,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub in_tangent: Option<KeyframeTangentDSL>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub out_tangent: Option<KeyframeTangentDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KeyframeInterpolationDSL {
    Hold,
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
    Bezier,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(deny_unknown_fields)]
pub struct KeyframeTangentDSL {
    pub time: f64,
    pub value: f64,
}
