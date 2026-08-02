use crate::compiler::{CompiledAutomationTarget, EffectInstanceHandle};
use crate::document::AnimatableValueDSL;
use crate::engine::color::{lerp_color_lab, parse_hex_color};
use crate::engine::effect::ParameterHandle;
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq)]
pub enum AnimatableValue {
    Float(f64),
    Color(u8, u8, u8),
}

impl AnimatableValue {
    pub fn from_document(value: &AnimatableValueDSL) -> Option<Self> {
        let AnimatableValueDSL::Color(color) = value else {
            return value.as_f64().map(Self::Float);
        };
        parse_hex_color(color)
            .ok()
            .map(|(red, green, blue)| Self::Color(red, green, blue))
    }

    pub fn lerp(&self, other: &Self, t: f64) -> Self {
        match (self, other) {
            (AnimatableValue::Float(a), AnimatableValue::Float(b)) => {
                AnimatableValue::Float(a + (b - a) * t)
            }
            (AnimatableValue::Color(r1, g1, b1), AnimatableValue::Color(r2, g2, b2)) => {
                let (r, g, b) = lerp_color_lab((*r1, *g1, *b1), (*r2, *g2, *b2), t);
                AnimatableValue::Color(r, g, b)
            }
            // Fallback: If types don't match, just snap to the target if we are halfway there
            _ => {
                if t >= 0.5 {
                    other.clone()
                } else {
                    self.clone()
                }
            }
        }
    }
}

pub fn ease(t: f64, easing: &str) -> f64 {
    let t = t.clamp(0.0, 1.0);
    match easing {
        "linear" => t,
        "ease_in" => t * t,
        "ease_out" => t * (2.0 - t),
        "ease_in_out" => {
            if t < 0.5 {
                2.0 * t * t
            } else {
                -1.0 + (4.0 - 2.0 * t) * t
            }
        }
        _ => t, // Default to linear
    }
}

// The Blackboard Context
#[derive(Clone, Default, Debug)]
pub struct ParameterContext {
    global_master_dimmer: Option<AnimatableValue>,
    effect_params: HashMap<EffectInstanceHandle, HashMap<ParameterHandle, AnimatableValue>>,
}

impl ParameterContext {
    pub fn new() -> Self {
        Self {
            global_master_dimmer: None,
            effect_params: HashMap::new(),
        }
    }

    pub fn write_value(&mut self, target: CompiledAutomationTarget, value: AnimatableValue) {
        match target {
            CompiledAutomationTarget::GlobalMasterDimmer => {
                self.global_master_dimmer = Some(value);
            }
            CompiledAutomationTarget::EffectInstance {
                instance,
                parameter,
            } => {
                self.effect_params
                    .entry(instance)
                    .or_default()
                    .insert(parameter, value);
            }
        }
    }

    pub fn global_master_dimmer(&self) -> Option<f64> {
        if let Some(AnimatableValue::Float(v)) = &self.global_master_dimmer {
            Some(*v)
        } else {
            None
        }
    }

    pub fn get_effect_float(
        &self,
        instance: &EffectInstanceHandle,
        parameter: ParameterHandle,
    ) -> Option<f64> {
        match self.effect_params.get(instance)?.get(&parameter)? {
            AnimatableValue::Float(value) => Some(*value),
            AnimatableValue::Color(_, _, _) => None,
        }
    }

    pub fn get_effect_color(
        &self,
        instance: &EffectInstanceHandle,
        parameter: ParameterHandle,
    ) -> Option<(u8, u8, u8)> {
        if let AnimatableValue::Color(r, g, b) =
            self.effect_params.get(instance)?.get(&parameter)?
        {
            Some((*r, *g, *b))
        } else {
            None
        }
    }

    pub fn clear(&mut self) {
        self.global_master_dimmer = None;
        self.effect_params.clear();
    }
}
