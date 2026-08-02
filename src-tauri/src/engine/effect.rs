use super::attribute::AttributeHandle;
use super::color::lerp_color_lab;
use super::profile::{profile_by_handle, AttributeValue, AttributeValueType, FixtureProfileHandle};
use std::collections::HashMap;

pub const SPEED_PARAMETER_ID: &str = "speed";
pub const PHASE_PARAMETER_ID: &str = "phase";
pub const WIDTH_PARAMETER_ID: &str = "width";
pub const TRANSITION_PARAMETER_ID: &str = "transition";
pub const INTENSITY_PARAMETER_ID: &str = "intensity";
pub const COLOR_PARAMETER_ID: &str = "color";
pub const DIRECTION_PARAMETER_ID: &str = "direction";
pub const PAN_PARAMETER_ID: &str = "pan";
pub const TILT_PARAMETER_ID: &str = "tilt";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct EffectDefinitionHandle(usize);

impl EffectDefinitionHandle {
    pub const fn from_index(index: usize) -> Self {
        Self(index)
    }

    pub const fn index(self) -> usize {
        self.0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct ParameterHandle(u16);

impl ParameterHandle {
    pub fn from_index(index: usize) -> Option<Self> {
        u16::try_from(index).ok().map(Self)
    }

    pub const fn index(self) -> usize {
        self.0 as usize
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct EffectNodeHandle(u16);

impl EffectNodeHandle {
    pub fn from_index(index: usize) -> Option<Self> {
        u16::try_from(index).ok().map(Self)
    }

    pub const fn index(self) -> usize {
        self.0 as usize
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParameterValueType {
    Scalar,
    Color,
    Direction,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Direction {
    Forward,
    Reverse,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ParameterValue {
    Scalar(f64),
    Color([u8; 3]),
    Direction(Direction),
}

impl ParameterValue {
    pub const fn value_type(&self) -> ParameterValueType {
        match self {
            Self::Scalar(_) => ParameterValueType::Scalar,
            Self::Color(_) => ParameterValueType::Color,
            Self::Direction(_) => ParameterValueType::Direction,
        }
    }

    pub const fn as_scalar(&self) -> Option<f64> {
        match self {
            Self::Scalar(value) => Some(*value),
            Self::Color(_) | Self::Direction(_) => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParameterUnit {
    Multiplier,
    Cycles,
    Percent,
    Normalized,
    Color,
    Direction,
    Degrees,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParameterUiHint {
    Slider,
    Color,
    Segmented,
    Angle,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AutomationPolicy {
    Continuous,
    Discrete,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EffectSource {
    BuiltIn,
    ProjectLocal,
    UserLibrary,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MotionTag {
    Static,
    Pulse,
    Chase,
    Sweep,
    Organic,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum StrobeRisk {
    None,
    Low,
    Medium,
    High,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EffectCatalog {
    pub mood: Vec<String>,
    pub energy: f32,
    pub density: f32,
    pub motion: MotionTag,
    pub colorfulness: f32,
    pub strobe_risk: StrobeRisk,
    pub required_attributes: Vec<String>,
}

impl Default for EffectCatalog {
    fn default() -> Self {
        Self {
            mood: Vec::new(),
            energy: 0.0,
            density: 0.0,
            motion: MotionTag::Static,
            colorfulness: 0.0,
            strobe_risk: StrobeRisk::None,
            required_attributes: Vec::new(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct CompiledEffectStep {
    pub values: Vec<Option<AttributeValue>>,
    pub width: f64,
    pub transition: f64,
    pub accel: i32,
    pub decel: i32,
}

#[derive(Clone, Debug)]
pub struct CompiledProfileSequence {
    pub steps: Vec<CompiledEffectStep>,
    pub intensity: Option<AttributeHandle>,
    pub color: Option<AttributeHandle>,
    pub pan: Option<AttributeHandle>,
    pub tilt: Option<AttributeHandle>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OscillatorWaveform {
    Sine,
    Triangle,
    Saw,
    Pulse,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpatialBasis {
    Index,
    X,
    Y,
    Distance,
    Angle,
    Custom,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MathOperation {
    Add,
    Subtract,
    Multiply,
    Divide,
    Min,
    Max,
}

#[derive(Clone, Debug)]
pub struct CompiledColorStop {
    pub position: f64,
    pub color: [u8; 3],
}

#[derive(Clone, Debug)]
pub enum CompiledEffectNode {
    Time,
    Constant(ParameterValue),
    Random,
    StepSequence {
        phase: EffectNodeHandle,
        profiles: HashMap<FixtureProfileHandle, CompiledProfileSequence>,
    },
    Oscillator {
        waveform: OscillatorWaveform,
        phase: EffectNodeHandle,
    },
    Envelope {
        input: EffectNodeHandle,
        attack: f64,
        release: f64,
    },
    SpatialPhase {
        input: EffectNodeHandle,
        basis: SpatialBasis,
        from: f64,
        to: f64,
        wrap: bool,
        group_size: Option<usize>,
        custom_order: Vec<u32>,
    },
    Math {
        operation: MathOperation,
        left: EffectNodeHandle,
        right: EffectNodeHandle,
    },
    Map {
        input: EffectNodeHandle,
        input_range: (f64, f64),
        output_range: (f64, f64),
    },
    Clamp {
        input: EffectNodeHandle,
        min: f64,
        max: f64,
    },
    ColorGradient {
        input: EffectNodeHandle,
        stops: Vec<CompiledColorStop>,
    },
    FixtureMask {
        input: EffectNodeHandle,
        min: f64,
        max: f64,
    },
    AttributeWriter {
        input: EffectNodeHandle,
        mask: Option<EffectNodeHandle>,
        attributes: HashMap<FixtureProfileHandle, Option<AttributeHandle>>,
    },
}

#[derive(Clone, Debug, Default)]
pub struct CompiledEffectGraph {
    pub nodes: Vec<CompiledEffectNode>,
    pub writers: Vec<EffectNodeHandle>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ParameterDefinition {
    pub id: String,
    pub value_type: ParameterValueType,
    pub default_value: ParameterValue,
    pub range: Option<(f64, f64)>,
    pub unit: ParameterUnit,
    pub ui_hint: ParameterUiHint,
    pub automation: AutomationPolicy,
}

impl ParameterDefinition {
    pub fn accepts(&self, value: &ParameterValue) -> bool {
        if value.value_type() != self.value_type {
            return false;
        }
        match (self.range, value.as_scalar()) {
            (Some((min, max)), Some(value)) => value.is_finite() && value >= min && value <= max,
            _ => true,
        }
    }
}

#[derive(Clone, Debug)]
pub struct EffectDefinition {
    pub id: String,
    pub name: String,
    pub revision: u32,
    pub source: EffectSource,
    pub parameters: Vec<ParameterDefinition>,
    pub graph: CompiledEffectGraph,
    pub catalog: EffectCatalog,
}

impl EffectDefinition {
    pub fn legacy(id: &str, name: &str, default_speed: f64) -> Self {
        Self {
            id: format!("legacy.{id}"),
            name: name.to_string(),
            revision: 1,
            source: EffectSource::ProjectLocal,
            parameters: common_parameters(default_speed),
            graph: CompiledEffectGraph::default(),
            catalog: EffectCatalog::default(),
        }
    }

    pub fn parameter_handle(&self, id: &str) -> Option<ParameterHandle> {
        self.parameters
            .iter()
            .position(|parameter| parameter.id == id)
            .and_then(ParameterHandle::from_index)
    }

    pub fn parameter(&self, handle: ParameterHandle) -> Option<&ParameterDefinition> {
        self.parameters.get(handle.index())
    }
}

#[derive(Clone, Debug)]
pub struct EffectInstance {
    pub id: String,
    pub definition: EffectDefinitionHandle,
    pub target_group_id: String,
    pub parameter_overrides: HashMap<ParameterHandle, ParameterValue>,
    pub seed: u64,
    pub spatial_offsets: HashMap<EffectNodeHandle, Vec<f64>>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum EffectValue {
    Empty,
    Scalar(f64),
    Color([u8; 3]),
    Direction(Direction),
    Mask(bool),
    AttributeSet(Vec<Option<AttributeValue>>),
}

impl EffectValue {
    fn scalar(&self) -> f64 {
        match self {
            Self::Scalar(value) => *value,
            _ => 0.0,
        }
    }
}

pub fn deterministic_random(seed: u64, node: EffectNodeHandle, fixture_id: u32, phase: f64) -> f64 {
    let mut value = seed
        ^ (u64::from(node.0).wrapping_mul(0x9e37_79b9_7f4a_7c15))
        ^ (u64::from(fixture_id).wrapping_mul(0xbf58_476d_1ce4_e5b9))
        ^ phase.floor().to_bits();
    value ^= value >> 30;
    value = value.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value ^= value >> 27;
    value = value.wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^= value >> 31;
    (value >> 11) as f64 / ((1_u64 << 53) as f64)
}

pub fn evaluate_effect_graph(
    definition: &EffectDefinition,
    instance: &EffectInstance,
    fixture_id: u32,
    fixture_index: usize,
    profile: FixtureProfileHandle,
    phase: f64,
) -> Vec<(AttributeHandle, AttributeValue)> {
    let mut values = Vec::with_capacity(definition.graph.nodes.len());
    for (index, node) in definition.graph.nodes.iter().enumerate() {
        let handle = EffectNodeHandle::from_index(index).expect("compiled graph node handle");
        let value = match node {
            CompiledEffectNode::Time => EffectValue::Scalar(phase),
            CompiledEffectNode::Constant(value) => match value {
                ParameterValue::Scalar(value) => EffectValue::Scalar(*value),
                ParameterValue::Color(value) => EffectValue::Color(*value),
                ParameterValue::Direction(value) => EffectValue::Direction(*value),
            },
            CompiledEffectNode::Random => EffectValue::Scalar(deterministic_random(
                instance.seed,
                handle,
                fixture_id,
                phase,
            )),
            CompiledEffectNode::StepSequence { phase, profiles } => {
                let Some(sequence) = profiles.get(&profile) else {
                    values.push(EffectValue::Empty);
                    continue;
                };
                let cycle = values[phase.index()].scalar();
                if cycle < 0.0 {
                    EffectValue::Empty
                } else {
                    let total_width: f64 = sequence.steps.iter().map(|step| step.width).sum();
                    if total_width <= 0.0 {
                        EffectValue::Empty
                    } else {
                        EffectValue::AttributeSet(evaluate_steps(
                            cycle.rem_euclid(1.0) * total_width,
                            &sequence.steps,
                        ))
                    }
                }
            }
            CompiledEffectNode::Oscillator { waveform, phase } => {
                let cycle = values[phase.index()].scalar().rem_euclid(1.0);
                let output = match waveform {
                    OscillatorWaveform::Sine => ((cycle * std::f64::consts::TAU).sin() + 1.0) * 0.5,
                    OscillatorWaveform::Triangle => 1.0 - (cycle * 2.0 - 1.0).abs(),
                    OscillatorWaveform::Saw => cycle,
                    OscillatorWaveform::Pulse => f64::from(cycle < 0.5),
                };
                EffectValue::Scalar(output)
            }
            CompiledEffectNode::Envelope {
                input,
                attack,
                release,
            } => {
                let position = values[input.index()].scalar().rem_euclid(1.0);
                let output = if *attack > 0.0 && position < *attack {
                    position / attack
                } else if *release > 0.0 && position > 1.0 - release {
                    (1.0 - position) / release
                } else {
                    1.0
                };
                EffectValue::Scalar(output.clamp(0.0, 1.0))
            }
            CompiledEffectNode::SpatialPhase { input, wrap, .. } => {
                let offset = instance
                    .spatial_offsets
                    .get(&handle)
                    .and_then(|offsets| offsets.get(fixture_index))
                    .copied()
                    .unwrap_or(0.0);
                let value = values[input.index()].scalar() - offset;
                EffectValue::Scalar(if *wrap { value.rem_euclid(1.0) } else { value })
            }
            CompiledEffectNode::Math {
                operation,
                left,
                right,
            } => {
                let left = values[left.index()].scalar();
                let right = values[right.index()].scalar();
                let output = match operation {
                    MathOperation::Add => left + right,
                    MathOperation::Subtract => left - right,
                    MathOperation::Multiply => left * right,
                    MathOperation::Divide => {
                        if right.abs() <= f64::EPSILON {
                            0.0
                        } else {
                            left / right
                        }
                    }
                    MathOperation::Min => left.min(right),
                    MathOperation::Max => left.max(right),
                };
                EffectValue::Scalar(output)
            }
            CompiledEffectNode::Map {
                input,
                input_range,
                output_range,
            } => {
                let input = values[input.index()].scalar();
                let normalized = (input - input_range.0) / (input_range.1 - input_range.0);
                EffectValue::Scalar(output_range.0 + normalized * (output_range.1 - output_range.0))
            }
            CompiledEffectNode::Clamp { input, min, max } => {
                EffectValue::Scalar(values[input.index()].scalar().clamp(*min, *max))
            }
            CompiledEffectNode::ColorGradient { input, stops } => {
                EffectValue::Color(evaluate_gradient(values[input.index()].scalar(), stops))
            }
            CompiledEffectNode::FixtureMask { input, min, max } => {
                let input = values[input.index()].scalar();
                EffectValue::Mask(input >= *min && input <= *max)
            }
            CompiledEffectNode::AttributeWriter { .. } => EffectValue::Empty,
        };
        values.push(value);
    }

    let mut writes = Vec::new();
    for writer in &definition.graph.writers {
        let CompiledEffectNode::AttributeWriter {
            input,
            mask,
            attributes,
        } = &definition.graph.nodes[writer.index()]
        else {
            continue;
        };
        if mask.is_some_and(|mask| !matches!(values[mask.index()], EffectValue::Mask(true))) {
            continue;
        }
        match &values[input.index()] {
            EffectValue::AttributeSet(set) => {
                writes.extend(set.iter().enumerate().filter_map(|(index, value)| {
                    Some((AttributeHandle::from_index(index)?, value.clone()?))
                }));
            }
            EffectValue::Scalar(value) => {
                if let Some(Some(attribute)) = attributes.get(&profile) {
                    let descriptor = &profile_by_handle(profile).attributes[attribute.index()];
                    let value = match descriptor.value_type {
                        AttributeValueType::Scalar => AttributeValue::Scalar(*value as f32),
                        AttributeValueType::Angle => AttributeValue::Angle(*value as f32),
                        AttributeValueType::Boolean => AttributeValue::Boolean(*value >= 0.5),
                        AttributeValueType::Color | AttributeValueType::Enum => continue,
                    };
                    writes.push((*attribute, value));
                }
            }
            EffectValue::Color(value) => {
                if let Some(Some(attribute)) = attributes.get(&profile) {
                    writes.push((*attribute, AttributeValue::Color(*value)));
                }
            }
            _ => {}
        }
    }
    writes
}

fn evaluate_gradient(position: f64, stops: &[CompiledColorStop]) -> [u8; 3] {
    let Some(first) = stops.first() else {
        return [0, 0, 0];
    };
    if position <= first.position {
        return first.color;
    }
    for pair in stops.windows(2) {
        if position <= pair[1].position {
            let width = pair[1].position - pair[0].position;
            let progress = if width <= f64::EPSILON {
                1.0
            } else {
                (position - pair[0].position) / width
            };
            let color = lerp_color_lab(
                (pair[0].color[0], pair[0].color[1], pair[0].color[2]),
                (pair[1].color[0], pair[1].color[1], pair[1].color[2]),
                progress,
            );
            return [color.0, color.1, color.2];
        }
    }
    stops.last().map_or([0, 0, 0], |stop| stop.color)
}

fn evaluate_steps(position: f64, steps: &[CompiledEffectStep]) -> Vec<Option<AttributeValue>> {
    if steps.is_empty() {
        return Vec::new();
    }
    let mut accumulated = 0.0;
    for (index, step) in steps.iter().enumerate() {
        if position <= accumulated + step.width {
            let progress = if step.width > 0.0 {
                (position - accumulated) / step.width
            } else {
                0.0
            };
            let previous = &steps[(index + steps.len() - 1) % steps.len()];
            let transition = step.transition / 100.0;
            if transition > 0.0 && progress <= transition {
                let progress = apply_accel_decel(progress / transition, step.accel, step.decel);
                return previous
                    .values
                    .iter()
                    .zip(&step.values)
                    .map(|(previous, current)| match (previous, current) {
                        (Some(previous), Some(current)) => Some(
                            super::attribute::interpolate_attribute(previous, current, progress),
                        ),
                        (_, Some(current)) => Some(current.clone()),
                        _ => None,
                    })
                    .collect();
            }
            return step.values.clone();
        }
        accumulated += step.width;
    }
    steps[0].values.clone()
}

fn apply_accel_decel(value: f64, accel: i32, decel: i32) -> f64 {
    let first = (f64::from(accel) + 100.0) / 300.0;
    let second = (f64::from(decel) + 100.0) / 300.0;
    let mut low = 0.0_f64;
    let mut high = 1.0_f64;
    for _ in 0..16 {
        let middle = (low + high) * 0.5;
        if bezier_component(middle, first, 1.0 - second) < value {
            low = middle;
        } else {
            high = middle;
        }
    }
    let progress = (low + high) * 0.5;
    let inverse = 1.0 - progress;
    3.0 * inverse * progress * progress + progress * progress * progress
}

fn bezier_component(value: f64, first: f64, second: f64) -> f64 {
    let inverse = 1.0 - value;
    3.0 * inverse * inverse * value * first
        + 3.0 * inverse * value * value * second
        + value * value * value
}

impl EffectInstance {
    pub fn resolve_parameter<'a>(
        &'a self,
        definition: &'a EffectDefinition,
        handle: ParameterHandle,
    ) -> Option<&'a ParameterValue> {
        self.parameter_overrides.get(&handle).or_else(|| {
            definition
                .parameter(handle)
                .map(|parameter| &parameter.default_value)
        })
    }

    pub fn stable_seed(id: &str) -> u64 {
        id.bytes().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
        })
    }
}

pub fn common_parameters(default_speed: f64) -> Vec<ParameterDefinition> {
    vec![
        scalar_parameter(
            SPEED_PARAMETER_ID,
            default_speed,
            (0.01, 64.0),
            ParameterUnit::Multiplier,
            ParameterUiHint::Slider,
        ),
        scalar_parameter(
            PHASE_PARAMETER_ID,
            0.0,
            (-1.0, 1.0),
            ParameterUnit::Cycles,
            ParameterUiHint::Slider,
        ),
        scalar_parameter(
            WIDTH_PARAMETER_ID,
            100.0,
            (0.0, 100.0),
            ParameterUnit::Percent,
            ParameterUiHint::Slider,
        ),
        scalar_parameter(
            TRANSITION_PARAMETER_ID,
            100.0,
            (0.0, 100.0),
            ParameterUnit::Percent,
            ParameterUiHint::Slider,
        ),
        scalar_parameter(
            INTENSITY_PARAMETER_ID,
            1.0,
            (0.0, 1.0),
            ParameterUnit::Normalized,
            ParameterUiHint::Slider,
        ),
        ParameterDefinition {
            id: COLOR_PARAMETER_ID.to_string(),
            value_type: ParameterValueType::Color,
            default_value: ParameterValue::Color([255, 255, 255]),
            range: None,
            unit: ParameterUnit::Color,
            ui_hint: ParameterUiHint::Color,
            automation: AutomationPolicy::Continuous,
        },
        ParameterDefinition {
            id: DIRECTION_PARAMETER_ID.to_string(),
            value_type: ParameterValueType::Direction,
            default_value: ParameterValue::Direction(Direction::Forward),
            range: None,
            unit: ParameterUnit::Direction,
            ui_hint: ParameterUiHint::Segmented,
            automation: AutomationPolicy::Discrete,
        },
        scalar_parameter(
            PAN_PARAMETER_ID,
            0.0,
            (-540.0, 540.0),
            ParameterUnit::Degrees,
            ParameterUiHint::Angle,
        ),
        scalar_parameter(
            TILT_PARAMETER_ID,
            0.0,
            (-270.0, 270.0),
            ParameterUnit::Degrees,
            ParameterUiHint::Angle,
        ),
    ]
}

pub fn common_parameter_handle(id: &str) -> Option<ParameterHandle> {
    let index = match id {
        SPEED_PARAMETER_ID => 0,
        PHASE_PARAMETER_ID => 1,
        WIDTH_PARAMETER_ID => 2,
        TRANSITION_PARAMETER_ID => 3,
        INTENSITY_PARAMETER_ID => 4,
        COLOR_PARAMETER_ID => 5,
        DIRECTION_PARAMETER_ID => 6,
        PAN_PARAMETER_ID => 7,
        TILT_PARAMETER_ID => 8,
        _ => return None,
    };
    ParameterHandle::from_index(index)
}

fn scalar_parameter(
    id: &str,
    default_value: f64,
    range: (f64, f64),
    unit: ParameterUnit,
    ui_hint: ParameterUiHint,
) -> ParameterDefinition {
    ParameterDefinition {
        id: id.to_string(),
        value_type: ParameterValueType::Scalar,
        default_value: ParameterValue::Scalar(default_value),
        range: Some(range),
        unit,
        ui_hint,
        automation: AutomationPolicy::Continuous,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        deterministic_random, evaluate_effect_graph, CompiledColorStop, CompiledEffectGraph,
        CompiledEffectNode, CompiledEffectStep, Direction, EffectCatalog, EffectDefinition,
        EffectDefinitionHandle, EffectInstance, EffectNodeHandle, EffectSource, MathOperation,
        OscillatorWaveform, ParameterValue, SpatialBasis, COLOR_PARAMETER_ID,
        DIRECTION_PARAMETER_ID, SPEED_PARAMETER_ID,
    };
    use crate::engine::attribute::resolve_attribute;
    use crate::engine::profile::{
        profile_handle_by_id, AttributeValue, COLOR_RGB_ATTRIBUTE, GENERIC_RGB_PROFILE_ID,
        INTENSITY_ATTRIBUTE,
    };
    use std::collections::HashMap;

    #[test]
    fn typed_parameters_reject_wrong_types_and_ranges() {
        let definition = EffectDefinition::legacy("pulse", "Pulse", 2.0);
        let speed = definition
            .parameter_handle(SPEED_PARAMETER_ID)
            .expect("speed");
        let color = definition
            .parameter_handle(COLOR_PARAMETER_ID)
            .expect("color");
        let direction = definition
            .parameter_handle(DIRECTION_PARAMETER_ID)
            .expect("direction");

        assert!(definition
            .parameter(speed)
            .expect("speed definition")
            .accepts(&ParameterValue::Scalar(4.0)));
        assert!(!definition
            .parameter(speed)
            .expect("speed definition")
            .accepts(&ParameterValue::Scalar(0.0)));
        assert!(!definition
            .parameter(color)
            .expect("color definition")
            .accepts(&ParameterValue::Scalar(1.0)));
        assert!(definition
            .parameter(direction)
            .expect("direction definition")
            .accepts(&ParameterValue::Direction(Direction::Reverse)));
    }

    #[test]
    fn instances_resolve_overrides_without_mutating_definitions() {
        let definition = EffectDefinition::legacy("pulse", "Pulse", 1.0);
        let speed = definition
            .parameter_handle(SPEED_PARAMETER_ID)
            .expect("speed");
        let definition_handle = EffectDefinitionHandle::from_index(0);
        let instance = EffectInstance {
            id: "pulse-a".to_string(),
            definition: definition_handle,
            target_group_id: "all".to_string(),
            parameter_overrides: HashMap::from([(speed, ParameterValue::Scalar(2.0))]),
            seed: EffectInstance::stable_seed("pulse-a"),
            spatial_offsets: HashMap::new(),
        };

        assert_eq!(
            instance.resolve_parameter(&definition, speed),
            Some(&ParameterValue::Scalar(2.0))
        );
        assert_eq!(
            definition
                .parameter(speed)
                .map(|value| &value.default_value),
            Some(&ParameterValue::Scalar(1.0))
        );
        assert_eq!(instance.seed, EffectInstance::stable_seed("pulse-a"));
        assert_ne!(instance.seed, EffectInstance::stable_seed("pulse-b"));
    }

    #[test]
    fn random_node_is_reproducible_and_seed_fixture_and_cycle_sensitive() {
        let node = EffectNodeHandle::from_index(7).expect("node handle");
        let value = deterministic_random(42, node, 9, 3.25);

        assert_eq!(value, deterministic_random(42, node, 9, 3.99));
        assert_ne!(value, deterministic_random(43, node, 9, 3.25));
        assert_ne!(value, deterministic_random(42, node, 10, 3.25));
        assert_ne!(value, deterministic_random(42, node, 9, 4.0));
        assert!((0.0..1.0).contains(&value));
    }

    #[test]
    fn typed_graph_nodes_evaluate_as_a_pure_function() {
        let profile = profile_handle_by_id(GENERIC_RGB_PROFILE_ID).expect("RGB profile");
        let color = resolve_attribute(profile, COLOR_RGB_ATTRIBUTE).expect("color attribute");
        let handles = |index| EffectNodeHandle::from_index(index).expect("node handle");
        let definition = EffectDefinition {
            id: "test.typed-graph".to_string(),
            name: "Typed graph".to_string(),
            revision: 1,
            source: EffectSource::ProjectLocal,
            parameters: Vec::new(),
            graph: CompiledEffectGraph {
                nodes: vec![
                    CompiledEffectNode::Time,
                    CompiledEffectNode::SpatialPhase {
                        input: handles(0),
                        basis: SpatialBasis::Index,
                        from: 0.0,
                        to: 1.0,
                        wrap: true,
                        group_size: None,
                        custom_order: Vec::new(),
                    },
                    CompiledEffectNode::Oscillator {
                        waveform: OscillatorWaveform::Saw,
                        phase: handles(1),
                    },
                    CompiledEffectNode::Envelope {
                        input: handles(2),
                        attack: 0.25,
                        release: 0.25,
                    },
                    CompiledEffectNode::Constant(ParameterValue::Scalar(0.5)),
                    CompiledEffectNode::Math {
                        operation: MathOperation::Add,
                        left: handles(3),
                        right: handles(4),
                    },
                    CompiledEffectNode::Map {
                        input: handles(5),
                        input_range: (0.0, 2.0),
                        output_range: (0.0, 1.0),
                    },
                    CompiledEffectNode::Clamp {
                        input: handles(6),
                        min: 0.0,
                        max: 1.0,
                    },
                    CompiledEffectNode::ColorGradient {
                        input: handles(7),
                        stops: vec![
                            CompiledColorStop {
                                position: 0.0,
                                color: [0, 0, 0],
                            },
                            CompiledColorStop {
                                position: 1.0,
                                color: [255, 255, 255],
                            },
                        ],
                    },
                    CompiledEffectNode::FixtureMask {
                        input: handles(7),
                        min: 0.5,
                        max: 1.0,
                    },
                    CompiledEffectNode::AttributeWriter {
                        input: handles(8),
                        mask: Some(handles(9)),
                        attributes: HashMap::from([(profile, Some(color))]),
                    },
                ],
                writers: vec![handles(10)],
            },
            catalog: EffectCatalog::default(),
        };
        let instance = EffectInstance {
            id: "typed".to_string(),
            definition: EffectDefinitionHandle::from_index(0),
            target_group_id: "all".to_string(),
            parameter_overrides: HashMap::new(),
            seed: 42,
            spatial_offsets: HashMap::from([(handles(1), vec![0.25])]),
        };

        let first = evaluate_effect_graph(&definition, &instance, 1, 0, profile, 0.5);
        let replay = evaluate_effect_graph(&definition, &instance, 1, 0, profile, 0.5);
        assert_eq!(first, replay);
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].0, color);
        assert!(matches!(first[0].1, AttributeValue::Color(value) if value[0] > 100));
    }

    #[test]
    fn step_sequence_and_all_oscillator_waveforms_have_defined_outputs() {
        let steps = vec![
            CompiledEffectStep {
                values: vec![Some(AttributeValue::Scalar(1.0))],
                width: 50.0,
                transition: 0.0,
                accel: 0,
                decel: 0,
            },
            CompiledEffectStep {
                values: vec![Some(AttributeValue::Scalar(0.0))],
                width: 50.0,
                transition: 0.0,
                accel: 0,
                decel: 0,
            },
        ];
        assert_eq!(super::evaluate_steps(25.0, &steps), steps[0].values);
        assert_eq!(super::evaluate_steps(75.0, &steps), steps[1].values);

        let profile = profile_handle_by_id(GENERIC_RGB_PROFILE_ID).expect("RGB profile");
        let intensity = resolve_attribute(profile, INTENSITY_ATTRIBUTE).expect("intensity");
        for waveform in [
            OscillatorWaveform::Sine,
            OscillatorWaveform::Triangle,
            OscillatorWaveform::Saw,
            OscillatorWaveform::Pulse,
        ] {
            let definition = EffectDefinition {
                id: "oscillator".to_string(),
                name: "Oscillator".to_string(),
                revision: 1,
                source: EffectSource::ProjectLocal,
                parameters: Vec::new(),
                graph: CompiledEffectGraph {
                    nodes: vec![
                        CompiledEffectNode::Time,
                        CompiledEffectNode::Oscillator {
                            waveform,
                            phase: EffectNodeHandle::from_index(0).expect("time"),
                        },
                        CompiledEffectNode::AttributeWriter {
                            input: EffectNodeHandle::from_index(1).expect("oscillator"),
                            mask: None,
                            attributes: HashMap::from([(profile, Some(intensity))]),
                        },
                    ],
                    writers: vec![EffectNodeHandle::from_index(2).expect("writer")],
                },
                catalog: EffectCatalog::default(),
            };
            let instance = EffectInstance {
                id: "oscillator".to_string(),
                definition: EffectDefinitionHandle::from_index(0),
                target_group_id: "all".to_string(),
                parameter_overrides: HashMap::new(),
                seed: 1,
                spatial_offsets: HashMap::new(),
            };
            let writes = evaluate_effect_graph(&definition, &instance, 1, 0, profile, 0.25);
            assert!(
                matches!(writes.as_slice(), [(handle, AttributeValue::Scalar(value))] if *handle == intensity && (0.0..=1.0).contains(value))
            );
        }
    }
}
