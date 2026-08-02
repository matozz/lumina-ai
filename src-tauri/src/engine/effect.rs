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
    pub parameters: Vec<ParameterDefinition>,
}

impl EffectDefinition {
    pub fn legacy(id: &str, name: &str, default_speed: f64) -> Self {
        Self {
            id: format!("legacy.{id}"),
            name: name.to_string(),
            revision: 1,
            parameters: common_parameters(default_speed),
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
        Direction, EffectDefinition, EffectDefinitionHandle, EffectInstance, ParameterValue,
        COLOR_PARAMETER_ID, DIRECTION_PARAMETER_ID, SPEED_PARAMETER_ID,
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
}
