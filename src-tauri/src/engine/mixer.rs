use super::attribute::{interpolate_attribute, value_matches_type, AttributeHandle, FixtureFrame};
use super::profile::{profile_by_handle, AttributeDescriptor, AttributeValue, MixPolicy};
use serde::Serialize;

#[derive(Clone, Debug, PartialEq)]
pub struct AttributeWrite<'a> {
    pub attribute: AttributeHandle,
    pub value: AttributeValue,
    pub source_id: &'a str,
    pub layer: u32,
    pub priority: i32,
    pub activation_order: u64,
    pub stable_source_order: u32,
    pub weight: Option<f32>,
    pub policy_override: Option<MixPolicy>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MixResult {
    pub frame: FixtureFrame,
    pub inspections: Vec<AttributeMixInspection>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AttributeMixInspection {
    pub fixture_id: u32,
    pub attribute_id: &'static str,
    pub resolution: MixResolution,
    pub contenders: Vec<MixContender>,
    pub winner_source_id: Option<String>,
    pub result: AttributeValue,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct MixContender {
    pub source_id: String,
    pub layer: u32,
    pub priority: i32,
    pub activation_order: u64,
    pub stable_source_order: u32,
    pub weight: f32,
    pub policy: MixPolicy,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MixResolution {
    HighestTakesPrecedence,
    LatestTakesPrecedence,
    OrderedBlend,
}

pub fn mix_fixture<'a>(
    mut frame: FixtureFrame,
    mut writes: Vec<AttributeWrite<'a>>,
    inspect_conflicts: bool,
) -> MixResult {
    writes.sort_by(|left, right| {
        (
            left.attribute,
            left.layer,
            left.priority,
            left.activation_order,
            left.stable_source_order,
            left.source_id,
        )
            .cmp(&(
                right.attribute,
                right.layer,
                right.priority,
                right.activation_order,
                right.stable_source_order,
                right.source_id,
            ))
    });

    let mut inspections = Vec::new();
    let mut start = 0;
    while start < writes.len() {
        let handle = writes[start].attribute;
        let mut end = start + 1;
        while end < writes.len() && writes[end].attribute == handle {
            end += 1;
        }

        let profile = profile_by_handle(frame.profile);
        let Some(descriptor) = profile.attributes.get(handle.index()) else {
            start = end;
            continue;
        };
        let Some(mut current) = frame.value(handle).cloned() else {
            start = end;
            continue;
        };

        let mut winner_source_id = None;
        let mut valid_write_count = 0;
        let mut all_htp = true;
        let mut all_ltp = true;
        let mut contenders = Vec::new();
        for write in &writes[start..end] {
            if !value_matches_type(&write.value, descriptor.value_type)
                || write.weight.is_some_and(|weight| !weight.is_finite())
            {
                continue;
            }
            let policy = write.policy_override.unwrap_or(descriptor.mix_policy);
            let weight = write.weight.unwrap_or(1.0).clamp(0.0, 1.0);
            let before = current.clone();
            current = apply_write(current, &write.value, policy, weight);
            current = clamp_to_physical_range(current, descriptor);
            if policy == MixPolicy::Ltp || (policy == MixPolicy::Htp && current != before) {
                winner_source_id = Some(write.source_id);
            }
            valid_write_count += 1;
            all_htp &= policy == MixPolicy::Htp;
            all_ltp &= policy == MixPolicy::Ltp;
            if inspect_conflicts {
                contenders.push(MixContender {
                    source_id: write.source_id.to_string(),
                    layer: write.layer,
                    priority: write.priority,
                    activation_order: write.activation_order,
                    stable_source_order: write.stable_source_order,
                    weight,
                    policy,
                });
            }
        }
        frame.set(handle, current.clone());

        if inspect_conflicts && valid_write_count > 1 {
            let resolution = if all_htp {
                MixResolution::HighestTakesPrecedence
            } else if all_ltp {
                MixResolution::LatestTakesPrecedence
            } else {
                winner_source_id = None;
                MixResolution::OrderedBlend
            };
            inspections.push(AttributeMixInspection {
                fixture_id: frame.id,
                attribute_id: descriptor.id.as_str(),
                resolution,
                contenders,
                winner_source_id: winner_source_id.map(str::to_string),
                result: current,
            });
        }

        start = end;
    }

    MixResult { frame, inspections }
}

fn apply_write(
    current: AttributeValue,
    value: &AttributeValue,
    policy: MixPolicy,
    weight: f32,
) -> AttributeValue {
    match policy {
        MixPolicy::Htp => highest(current, value, weight),
        MixPolicy::Ltp if weight <= 0.0 => current,
        MixPolicy::Ltp if weight >= 1.0 => value.clone(),
        MixPolicy::Ltp => interpolate_attribute(&current, value, f64::from(weight)),
        MixPolicy::Add => add(current, value, weight),
        MixPolicy::Multiply => multiply(current, value, weight),
        MixPolicy::Mask => mask(current, value, weight),
    }
}

fn highest(current: AttributeValue, value: &AttributeValue, weight: f32) -> AttributeValue {
    match (current, value) {
        (AttributeValue::Scalar(current), AttributeValue::Scalar(value)) => {
            AttributeValue::Scalar(current.max(value * weight))
        }
        (AttributeValue::Angle(current), AttributeValue::Angle(value)) => {
            AttributeValue::Angle(current.max(value * weight))
        }
        (AttributeValue::Color(current), AttributeValue::Color(value)) => AttributeValue::Color([
            current[0].max(scale_channel(value[0], weight)),
            current[1].max(scale_channel(value[1], weight)),
            current[2].max(scale_channel(value[2], weight)),
        ]),
        (AttributeValue::Boolean(current), AttributeValue::Boolean(value)) => {
            AttributeValue::Boolean(current || (*value && weight > 0.0))
        }
        (current, _) => current,
    }
}

fn add(current: AttributeValue, value: &AttributeValue, weight: f32) -> AttributeValue {
    match (current, value) {
        (AttributeValue::Scalar(current), AttributeValue::Scalar(value)) => {
            AttributeValue::Scalar(current + value * weight)
        }
        (AttributeValue::Angle(current), AttributeValue::Angle(value)) => {
            AttributeValue::Angle(current + value * weight)
        }
        (AttributeValue::Color(current), AttributeValue::Color(value)) => AttributeValue::Color([
            current[0].saturating_add(scale_channel(value[0], weight)),
            current[1].saturating_add(scale_channel(value[1], weight)),
            current[2].saturating_add(scale_channel(value[2], weight)),
        ]),
        (current, _) => current,
    }
}

fn multiply(current: AttributeValue, value: &AttributeValue, weight: f32) -> AttributeValue {
    match (current, value) {
        (AttributeValue::Scalar(current), AttributeValue::Scalar(value)) => {
            AttributeValue::Scalar(current * (1.0 + (value - 1.0) * weight))
        }
        (AttributeValue::Angle(current), AttributeValue::Angle(value)) => {
            AttributeValue::Angle(current * (1.0 + (value - 1.0) * weight))
        }
        (AttributeValue::Color(current), AttributeValue::Color(value)) => AttributeValue::Color([
            multiply_channel(current[0], value[0], weight),
            multiply_channel(current[1], value[1], weight),
            multiply_channel(current[2], value[2], weight),
        ]),
        (current, _) => current,
    }
}

fn mask(current: AttributeValue, value: &AttributeValue, weight: f32) -> AttributeValue {
    match (current, value) {
        (AttributeValue::Boolean(current), AttributeValue::Boolean(value)) => {
            AttributeValue::Boolean(current && (*value || weight < 0.5))
        }
        (current, value) => multiply(current, value, weight),
    }
}

fn clamp_to_physical_range(
    value: AttributeValue,
    descriptor: &AttributeDescriptor,
) -> AttributeValue {
    let Some(range) = &descriptor.physical_range else {
        return value;
    };
    match value {
        AttributeValue::Scalar(value) => AttributeValue::Scalar(value.clamp(range.min, range.max)),
        AttributeValue::Angle(value) => AttributeValue::Angle(value.clamp(range.min, range.max)),
        value => value,
    }
}

fn scale_channel(value: u8, weight: f32) -> u8 {
    (f32::from(value) * weight).round().clamp(0.0, 255.0) as u8
}

fn multiply_channel(current: u8, value: u8, weight: f32) -> u8 {
    let multiplier = 1.0 + (f32::from(value) / 255.0 - 1.0) * weight;
    (f32::from(current) * multiplier).round().clamp(0.0, 255.0) as u8
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::attribute::resolve_attribute;
    use crate::engine::profile::{
        profile_handle_by_id, COLOR_RGB_ATTRIBUTE, GENERIC_MOVING_HEAD_PROFILE_ID,
        GENERIC_RGB_PROFILE_ID, INTENSITY_ATTRIBUTE, PAN_ATTRIBUTE,
    };

    fn write<'a>(
        attribute: AttributeHandle,
        value: AttributeValue,
        source_id: &'a str,
        priority: i32,
        activation_order: u64,
        stable_source_order: u32,
    ) -> AttributeWrite<'a> {
        AttributeWrite {
            attribute,
            value,
            source_id,
            layer: 0,
            priority,
            activation_order,
            stable_source_order,
            weight: None,
            policy_override: None,
        }
    }

    #[test]
    fn intensity_uses_profile_htp_policy() {
        let profile = profile_handle_by_id(GENERIC_RGB_PROFILE_ID).expect("RGB profile");
        let intensity = resolve_attribute(profile, INTENSITY_ATTRIBUTE).expect("intensity");
        let result = mix_fixture(
            FixtureFrame::with_profile_defaults(1, profile),
            vec![
                write(intensity, AttributeValue::Scalar(0.35), "low", 0, 1, 0),
                write(intensity, AttributeValue::Scalar(0.8), "high", 0, 0, 1),
            ],
            true,
        );

        assert_eq!(
            result.frame.value(intensity),
            Some(&AttributeValue::Scalar(0.8))
        );
        assert_eq!(
            result.inspections[0].resolution,
            MixResolution::HighestTakesPrecedence
        );
        assert_eq!(
            result.inspections[0].winner_source_id.as_deref(),
            Some("high")
        );
    }

    #[test]
    fn ltp_tie_break_is_layer_priority_activation_then_stable_source_order() {
        let profile = profile_handle_by_id(GENERIC_MOVING_HEAD_PROFILE_ID).expect("moving profile");
        let pan = resolve_attribute(profile, PAN_ATTRIBUTE).expect("pan");
        let mut higher_layer = write(pan, AttributeValue::Angle(5.0), "layer", -10, 0, 0);
        higher_layer.layer = 1;
        let cases = [
            (
                write(pan, AttributeValue::Angle(45.0), "layer-zero", 10, 9, 9),
                higher_layer,
                "layer",
                5.0,
            ),
            (
                write(pan, AttributeValue::Angle(10.0), "lower", 2, 9, 9),
                write(pan, AttributeValue::Angle(20.0), "priority", 3, 1, 0),
                "priority",
                20.0,
            ),
            (
                write(pan, AttributeValue::Angle(10.0), "earlier", 2, 7, 9),
                write(pan, AttributeValue::Angle(30.0), "activation", 2, 8, 0),
                "activation",
                30.0,
            ),
            (
                write(pan, AttributeValue::Angle(10.0), "stable-low", 2, 7, 2),
                write(pan, AttributeValue::Angle(40.0), "stable-high", 2, 7, 3),
                "stable-high",
                40.0,
            ),
        ];

        for (left, right, expected_source, expected_value) in cases {
            for writes in [vec![left.clone(), right.clone()], vec![right, left]] {
                let result = mix_fixture(
                    FixtureFrame::with_profile_defaults(1, profile),
                    writes,
                    true,
                );
                assert_eq!(
                    result.frame.value(pan),
                    Some(&AttributeValue::Angle(expected_value))
                );
                assert_eq!(
                    result.inspections[0].winner_source_id.as_deref(),
                    Some(expected_source)
                );
            }
        }
    }

    #[test]
    fn add_multiply_and_mask_require_explicit_overrides() {
        let profile = profile_handle_by_id(GENERIC_RGB_PROFILE_ID).expect("RGB profile");
        let intensity = resolve_attribute(profile, INTENSITY_ATTRIBUTE).expect("intensity");
        let color = resolve_attribute(profile, COLOR_RGB_ATTRIBUTE).expect("color");
        let mut base = FixtureFrame::with_profile_defaults(1, profile);
        base.set(intensity, AttributeValue::Scalar(0.5));
        base.set(color, AttributeValue::Color([200, 100, 50]));

        let mut additive = write(intensity, AttributeValue::Scalar(0.25), "add", 0, 0, 0);
        additive.policy_override = Some(MixPolicy::Add);
        let mut multiplier = write(intensity, AttributeValue::Scalar(0.5), "multiply", 0, 1, 0);
        multiplier.policy_override = Some(MixPolicy::Multiply);
        let mut mask = write(color, AttributeValue::Color([128, 255, 0]), "mask", 0, 2, 0);
        mask.policy_override = Some(MixPolicy::Mask);

        let result = mix_fixture(base, vec![mask, multiplier, additive], true);
        assert_eq!(
            result.frame.value(intensity),
            Some(&AttributeValue::Scalar(0.375))
        );
        assert_eq!(
            result.frame.value(color),
            Some(&AttributeValue::Color([100, 100, 0]))
        );
        assert!(result
            .inspections
            .iter()
            .any(|inspection| inspection.resolution == MixResolution::OrderedBlend));
    }

    #[test]
    fn weights_are_applied_and_physical_ranges_are_clamped() {
        let profile = profile_handle_by_id(GENERIC_MOVING_HEAD_PROFILE_ID).expect("moving profile");
        let pan = resolve_attribute(profile, PAN_ATTRIBUTE).expect("pan");
        let mut weighted = write(pan, AttributeValue::Angle(200.0), "weighted", 0, 0, 0);
        weighted.weight = Some(0.5);
        let mut additive = write(pan, AttributeValue::Angle(250.0), "add", 0, 1, 0);
        additive.policy_override = Some(MixPolicy::Add);

        let result = mix_fixture(
            FixtureFrame::with_profile_defaults(1, profile),
            vec![weighted, additive],
            false,
        );
        assert_eq!(result.frame.value(pan), Some(&AttributeValue::Angle(270.0)));
    }
}
