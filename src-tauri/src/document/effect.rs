use super::{AnimatableValueDSL, EasingDSL, GlobalParameterDSL, PhaserStepDSL};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct EffectDefinitionDSL {
    pub id: String,
    pub name: String,
    #[schemars(range(min = 1))]
    pub revision: u32,
    pub source: EffectSourceDSL,
    pub parameters: Vec<ParameterDefinitionDSL>,
    pub graph: EffectGraphDSL,
    pub catalog: EffectCatalogDSL,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EffectSourceDSL {
    BuiltIn,
    ProjectLocal,
    UserLibrary,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct ParameterDefinitionDSL {
    pub id: String,
    pub name: String,
    pub value_type: ParameterValueTypeDSL,
    pub default_value: ParameterValueDSL,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<(f64, f64)>,
    pub unit: ParameterUnitDSL,
    pub ui_hint: ParameterUiHintDSL,
    pub automation: AutomationPolicyDSL,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ParameterValueTypeDSL {
    Scalar,
    Color,
    Direction,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(
    tag = "type",
    content = "value",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum ParameterValueDSL {
    Scalar(f64),
    Color(String),
    Direction(DirectionDSL),
}

impl ParameterValueDSL {
    pub const fn value_type(&self) -> ParameterValueTypeDSL {
        match self {
            Self::Scalar(_) => ParameterValueTypeDSL::Scalar,
            Self::Color(_) => ParameterValueTypeDSL::Color,
            Self::Direction(_) => ParameterValueTypeDSL::Direction,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DirectionDSL {
    Forward,
    Reverse,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum ParameterUnitDSL {
    Multiplier,
    Cycles,
    Percent,
    Normalized,
    Color,
    Direction,
    Degrees,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum ParameterUiHintDSL {
    Slider,
    Color,
    Segmented,
    Angle,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum AutomationPolicyDSL {
    Continuous,
    Discrete,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct EffectInstanceDSL {
    pub id: String,
    pub definition_id: String,
    #[schemars(range(min = 1))]
    pub definition_revision: u32,
    pub target_group_id: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub parameter_overrides: BTreeMap<String, ParameterValueDSL>,
    pub seed: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct EffectCatalogDSL {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mood: Vec<String>,
    #[schemars(range(min = 0.0, max = 1.0))]
    pub energy: f32,
    #[schemars(range(min = 0.0, max = 1.0))]
    pub density: f32,
    pub motion: MotionTagDSL,
    #[schemars(range(min = 0.0, max = 1.0))]
    pub colorfulness: f32,
    pub strobe_risk: StrobeRiskDSL,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub required_attributes: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum MotionTagDSL {
    Static,
    Pulse,
    Chase,
    Sweep,
    Organic,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum StrobeRiskDSL {
    None,
    Low,
    Medium,
    High,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct EffectGraphDSL {
    pub nodes: Vec<EffectNodeDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum EffectNodeDSL {
    Time {
        id: String,
    },
    Constant {
        id: String,
        value: ParameterValueDSL,
    },
    Random {
        id: String,
    },
    StepSequence {
        id: String,
        phase: EffectPortRefDSL,
        steps: Vec<PhaserStepDSL>,
    },
    Oscillator {
        id: String,
        waveform: OscillatorWaveformDSL,
        phase: EffectPortRefDSL,
    },
    Envelope {
        id: String,
        input: EffectPortRefDSL,
        #[schemars(range(min = 0.0, max = 1.0))]
        attack: f64,
        #[schemars(range(min = 0.0, max = 1.0))]
        release: f64,
    },
    SpatialPhase {
        id: String,
        input: EffectPortRefDSL,
        basis: SpatialBasisDSL,
        from: f64,
        to: f64,
        wrap: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        group_size: Option<u32>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        custom_order: Vec<u32>,
    },
    Math {
        id: String,
        operation: MathOperationDSL,
        left: EffectPortRefDSL,
        right: EffectPortRefDSL,
    },
    Map {
        id: String,
        input: EffectPortRefDSL,
        input_range: (f64, f64),
        output_range: (f64, f64),
    },
    Clamp {
        id: String,
        input: EffectPortRefDSL,
        min: f64,
        max: f64,
    },
    ColorGradient {
        id: String,
        input: EffectPortRefDSL,
        stops: Vec<ColorStopDSL>,
    },
    FixtureMask {
        id: String,
        input: EffectPortRefDSL,
        min: f64,
        max: f64,
    },
    AttributeWriter {
        id: String,
        input: EffectPortRefDSL,
        #[serde(skip_serializing_if = "Option::is_none")]
        mask: Option<EffectPortRefDSL>,
        #[serde(skip_serializing_if = "Option::is_none")]
        attribute_id: Option<String>,
    },
}

impl EffectNodeDSL {
    pub fn id(&self) -> &str {
        match self {
            Self::Time { id }
            | Self::Constant { id, .. }
            | Self::Random { id }
            | Self::StepSequence { id, .. }
            | Self::Oscillator { id, .. }
            | Self::Envelope { id, .. }
            | Self::SpatialPhase { id, .. }
            | Self::Math { id, .. }
            | Self::Map { id, .. }
            | Self::Clamp { id, .. }
            | Self::ColorGradient { id, .. }
            | Self::FixtureMask { id, .. }
            | Self::AttributeWriter { id, .. } => id,
        }
    }

    pub const fn output_port(&self) -> EffectPortDSL {
        match self {
            Self::Time { .. }
            | Self::Random { .. }
            | Self::Oscillator { .. }
            | Self::Envelope { .. }
            | Self::SpatialPhase { .. }
            | Self::Math { .. }
            | Self::Map { .. }
            | Self::Clamp { .. } => EffectPortDSL::Scalar,
            Self::Constant { value, .. } => match value {
                ParameterValueDSL::Scalar(_) => EffectPortDSL::Scalar,
                ParameterValueDSL::Color(_) => EffectPortDSL::Color,
                ParameterValueDSL::Direction(_) => EffectPortDSL::Direction,
            },
            Self::StepSequence { .. } => EffectPortDSL::AttributeSet,
            Self::ColorGradient { .. } => EffectPortDSL::Color,
            Self::FixtureMask { .. } => EffectPortDSL::Mask,
            Self::AttributeWriter { .. } => EffectPortDSL::Writes,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct EffectPortRefDSL {
    pub node_id: String,
    pub port: EffectPortDSL,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EffectPortDSL {
    Scalar,
    Color,
    Direction,
    Mask,
    AttributeSet,
    Writes,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum OscillatorWaveformDSL {
    Sine,
    Triangle,
    Saw,
    Pulse,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum SpatialBasisDSL {
    Index,
    X,
    Y,
    Distance,
    Angle,
    Custom,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum MathOperationDSL {
    Add,
    Subtract,
    Multiply,
    Divide,
    Min,
    Max,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct ColorStopDSL {
    #[schemars(range(min = 0.0, max = 1.0))]
    pub position: f64,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TimelineV3DSL {
    pub events: Vec<TimelineEventV3DSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct TimelineEventV3DSL {
    #[schemars(range(min = 0.0))]
    pub beat: f64,
    #[schemars(range(min = 0.000_001))]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    pub action: TimelineActionV3DSL,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum TimelineActionV3DSL {
    Effect {
        instance_id: String,
    },
    Animate {
        target: AutomationTargetV3DSL,
        from: AnimatableValueDSL,
        to: AnimatableValueDSL,
        #[serde(skip_serializing_if = "Option::is_none")]
        easing: Option<EasingDSL>,
    },
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(tag = "scope", rename_all = "snake_case", deny_unknown_fields)]
pub enum AutomationTargetV3DSL {
    Global {
        parameter_id: GlobalParameterDSL,
    },
    EffectInstance {
        instance_id: String,
        parameter_id: String,
    },
}
