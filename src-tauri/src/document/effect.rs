use super::{GlobalParameterDSL, SequenceStepDSL};
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
    pub schema: ParameterSchemaDSL,
    pub scope: ParameterScopeDSL,
    pub section: ParameterSectionDSL,
    pub help: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub graph_binding: Option<ParameterGraphBindingDSL>,
}

impl ParameterDefinitionDSL {
    pub const fn value_type(&self) -> ParameterValueTypeDSL {
        self.schema.value_type()
    }

    pub fn default_value(&self) -> Option<ParameterValueDSL> {
        self.schema.default_value()
    }

    pub const fn range(&self) -> Option<(f64, f64)> {
        self.schema.range()
    }

    pub const fn step(&self) -> Option<f64> {
        self.schema.step()
    }

    pub fn enum_values(&self) -> &[String] {
        self.schema.enum_values()
    }

    pub const fn automation(&self) -> AutomationPolicyDSL {
        if !matches!(self.scope, ParameterScopeDSL::Arrangement) {
            return AutomationPolicyDSL::Disabled;
        }
        match self.value_type() {
            ParameterValueTypeDSL::Scalar | ParameterValueTypeDSL::Color => {
                AutomationPolicyDSL::Continuous
            }
            ParameterValueTypeDSL::Direction
            | ParameterValueTypeDSL::Boolean
            | ParameterValueTypeDSL::Enum => AutomationPolicyDSL::Discrete,
            ParameterValueTypeDSL::ColorStops => AutomationPolicyDSL::Disabled,
        }
    }

    pub const fn allows_cue_override(&self) -> bool {
        matches!(
            self.scope,
            ParameterScopeDSL::Cue | ParameterScopeDSL::Arrangement
        )
    }
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum ParameterSchemaDSL {
    Scalar {
        default: f64,
        range: ScalarParameterRangeDSL,
        unit: ScalarParameterUnitDSL,
    },
    Color {
        #[serde(skip_serializing_if = "Option::is_none")]
        default: Option<String>,
    },
    Direction {
        default: DirectionDSL,
    },
    Boolean {
        default: bool,
    },
    Enum {
        default: String,
        values: Vec<String>,
    },
    ColorStops {
        default: Vec<ColorStopDSL>,
    },
}

impl ParameterSchemaDSL {
    pub const fn value_type(&self) -> ParameterValueTypeDSL {
        match self {
            Self::Scalar { .. } => ParameterValueTypeDSL::Scalar,
            Self::Color { .. } => ParameterValueTypeDSL::Color,
            Self::Direction { .. } => ParameterValueTypeDSL::Direction,
            Self::Boolean { .. } => ParameterValueTypeDSL::Boolean,
            Self::Enum { .. } => ParameterValueTypeDSL::Enum,
            Self::ColorStops { .. } => ParameterValueTypeDSL::ColorStops,
        }
    }

    pub fn default_value(&self) -> Option<ParameterValueDSL> {
        match self {
            Self::Scalar { default, .. } => Some(ParameterValueDSL::Scalar(*default)),
            Self::Color { default } => default.clone().map(ParameterValueDSL::Color),
            Self::Direction { default } => Some(ParameterValueDSL::Direction(*default)),
            Self::Boolean { default } => Some(ParameterValueDSL::Boolean(*default)),
            Self::Enum { default, .. } => Some(ParameterValueDSL::Enum(default.clone())),
            Self::ColorStops { default } => Some(ParameterValueDSL::ColorStops(default.clone())),
        }
    }

    pub const fn range(&self) -> Option<(f64, f64)> {
        match self {
            Self::Scalar { range, .. } => Some((range.min, range.max)),
            _ => None,
        }
    }

    pub const fn step(&self) -> Option<f64> {
        match self {
            Self::Scalar { range, .. } => Some(range.step),
            _ => None,
        }
    }

    pub fn enum_values(&self) -> &[String] {
        match self {
            Self::Enum { values, .. } => values,
            _ => &[],
        }
    }
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(deny_unknown_fields)]
pub struct ScalarParameterRangeDSL {
    pub min: f64,
    pub max: f64,
    pub step: f64,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ParameterScopeDSL {
    Effect,
    Cue,
    Arrangement,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ParameterSectionDSL {
    Main,
    Advanced,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ParameterValueTypeDSL {
    Scalar,
    Color,
    Direction,
    Boolean,
    Enum,
    ColorStops,
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
    Boolean(bool),
    Enum(String),
    ColorStops(Vec<ColorStopDSL>),
}

impl ParameterValueDSL {
    pub const fn value_type(&self) -> ParameterValueTypeDSL {
        match self {
            Self::Scalar(_) => ParameterValueTypeDSL::Scalar,
            Self::Color(_) => ParameterValueTypeDSL::Color,
            Self::Direction(_) => ParameterValueTypeDSL::Direction,
            Self::Boolean(_) => ParameterValueTypeDSL::Boolean,
            Self::Enum(_) => ParameterValueTypeDSL::Enum,
            Self::ColorStops(_) => ParameterValueTypeDSL::ColorStops,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone)]
#[serde(deny_unknown_fields)]
pub struct ParameterGraphBindingDSL {
    pub node_id: String,
    pub property: EffectNodePropertyDSL,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum EffectNodePropertyDSL {
    Waveform,
    Attack,
    Release,
    ColorStops,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DirectionDSL {
    Forward,
    Reverse,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScalarParameterUnitDSL {
    None,
    Multiplier,
    Cycles,
    Percent,
    Normalized,
    Degrees,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum AutomationPolicyDSL {
    Continuous,
    Discrete,
    Disabled,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub family: Option<EffectFamilyDSL>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default)]
    pub visibility: CatalogVisibilityDSL,
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub layout_capabilities: Vec<LayoutCapabilityDSL>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EffectFamilyDSL {
    Intensity,
    Color,
    Movement,
    Spatial,
    Strobe,
    Utility,
}

#[derive(Debug, Default, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CatalogVisibilityDSL {
    #[default]
    Standard,
    Advanced,
    Hidden,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LayoutCapabilityDSL {
    Any,
    Linear,
    Matrix,
    Radial,
    Coordinates,
    TargetingScene,
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

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, Copy, PartialEq, Eq)]
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
        steps: Vec<SequenceStepDSL>,
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
                ParameterValueDSL::Boolean(_) => EffectPortDSL::Boolean,
                ParameterValueDSL::Enum(_) => EffectPortDSL::Enum,
                ParameterValueDSL::ColorStops(_) => EffectPortDSL::ColorStops,
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
    Boolean,
    Enum,
    ColorStops,
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
    RandomX,
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

#[derive(Debug, Serialize, Deserialize, JsonSchema, Clone, PartialEq, Eq, Hash)]
#[serde(tag = "scope", rename_all = "snake_case", deny_unknown_fields)]
pub enum AutomationTargetDSL {
    Global {
        parameter_id: GlobalParameterDSL,
    },
    EffectInstance {
        instance_id: String,
        parameter_id: String,
    },
}
