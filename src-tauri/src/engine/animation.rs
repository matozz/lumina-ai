use crate::engine::color::lerp_color_lab;
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq)]
pub enum AnimatableValue {
    Float(f64),
    Color(u8, u8, u8),
}

impl AnimatableValue {
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
            _ => if t >= 0.5 { other.clone() } else { self.clone() },
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
    pub global_params: HashMap<String, AnimatableValue>,
}

impl ParameterContext {
    pub fn new() -> Self {
        Self {
            global_params: HashMap::new(),
        }
    }

    pub fn write_value(&mut self, path: &str, value: AnimatableValue) {
        self.global_params.insert(path.to_string(), value);
    }

    pub fn get_float(&self, path: &str) -> Option<f64> {
        if let Some(AnimatableValue::Float(v)) = self.global_params.get(path) {
            Some(*v)
        } else {
            None
        }
    }

    pub fn get_color(&self, path: &str) -> Option<(u8, u8, u8)> {
        if let Some(AnimatableValue::Color(r, g, b)) = self.global_params.get(path) {
            Some((*r, *g, *b))
        } else {
            None
        }
    }
    
    pub fn clear(&mut self) {
        self.global_params.clear();
    }
}
