use super::color::lerp_color_lab;
use super::profile::{profile_by_handle, AttributeValue, AttributeValueType, FixtureProfileHandle};
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct AttributeHandle(u16);

impl AttributeHandle {
    pub const fn index(self) -> usize {
        self.0 as usize
    }

    pub fn from_index(index: usize) -> Option<Self> {
        u16::try_from(index).ok().map(Self)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct FixtureFrame {
    pub id: u32,
    pub profile: FixtureProfileHandle,
    values: Vec<AttributeValue>,
}

impl FixtureFrame {
    pub fn with_profile_defaults(id: u32, profile: FixtureProfileHandle) -> Self {
        let values = profile_by_handle(profile)
            .attributes
            .iter()
            .map(|attribute| attribute.default_value.clone())
            .collect();
        Self {
            id,
            profile,
            values,
        }
    }

    pub fn value(&self, handle: AttributeHandle) -> Option<&AttributeValue> {
        self.values.get(handle.index())
    }

    pub fn set(&mut self, handle: AttributeHandle, value: AttributeValue) -> bool {
        let Some(descriptor) = profile_by_handle(self.profile)
            .attributes
            .get(handle.index())
        else {
            return false;
        };
        if !value_matches_type(&value, descriptor.value_type) {
            return false;
        }
        let Some(slot) = self.values.get_mut(handle.index()) else {
            return false;
        };
        *slot = value;
        true
    }

    pub fn values(&self) -> &[AttributeValue] {
        &self.values
    }

    pub fn to_payload(&self) -> FixtureFramePayload {
        let profile = profile_by_handle(self.profile);
        FixtureFramePayload {
            id: self.id,
            profile_id: profile.id.as_str(),
            attributes: profile
                .attributes
                .iter()
                .zip(&self.values)
                .map(|(descriptor, value)| AttributePayload {
                    id: descriptor.id.as_str(),
                    value: value.clone(),
                })
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct FixtureFramePayload {
    pub id: u32,
    pub profile_id: &'static str,
    pub attributes: Vec<AttributePayload>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AttributePayload {
    pub id: &'static str,
    pub value: AttributeValue,
}

pub fn resolve_attribute(
    profile: FixtureProfileHandle,
    attribute_id: &str,
) -> Option<AttributeHandle> {
    profile_by_handle(profile)
        .attributes
        .iter()
        .position(|attribute| attribute.id == attribute_id)
        .and_then(|index| u16::try_from(index).ok())
        .map(AttributeHandle)
}

pub fn frame_changed(previous: &FixtureFrame, current: &FixtureFrame) -> bool {
    if previous.id != current.id
        || previous.profile != current.profile
        || previous.values.len() != current.values.len()
    {
        return true;
    }
    previous
        .values
        .iter()
        .zip(&current.values)
        .any(|(left, right)| value_changed(left, right))
}

pub fn interpolate_attribute(
    from: &AttributeValue,
    to: &AttributeValue,
    progress: f64,
) -> AttributeValue {
    let progress = progress.clamp(0.0, 1.0) as f32;
    match (from, to) {
        (AttributeValue::Scalar(left), AttributeValue::Scalar(right)) => {
            AttributeValue::Scalar(left + (right - left) * progress)
        }
        (AttributeValue::Angle(left), AttributeValue::Angle(right)) => {
            AttributeValue::Angle(left + (right - left) * progress)
        }
        (AttributeValue::Color(left), AttributeValue::Color(right)) => {
            let color = lerp_color_lab(
                (left[0], left[1], left[2]),
                (right[0], right[1], right[2]),
                f64::from(progress),
            );
            AttributeValue::Color([color.0, color.1, color.2])
        }
        (AttributeValue::Enum(_), AttributeValue::Enum(_))
        | (AttributeValue::Boolean(_), AttributeValue::Boolean(_)) => {
            if progress < 0.5 {
                from.clone()
            } else {
                to.clone()
            }
        }
        _ => to.clone(),
    }
}

pub fn value_matches_type(value: &AttributeValue, value_type: AttributeValueType) -> bool {
    matches!(
        (value, value_type),
        (AttributeValue::Scalar(_), AttributeValueType::Scalar)
            | (AttributeValue::Color(_), AttributeValueType::Color)
            | (AttributeValue::Angle(_), AttributeValueType::Angle)
            | (AttributeValue::Enum(_), AttributeValueType::Enum)
            | (AttributeValue::Boolean(_), AttributeValueType::Boolean)
    )
}

fn value_changed(previous: &AttributeValue, current: &AttributeValue) -> bool {
    match (previous, current) {
        (AttributeValue::Scalar(left), AttributeValue::Scalar(right))
        | (AttributeValue::Angle(left), AttributeValue::Angle(right)) => {
            (left - right).abs() > 0.005
        }
        _ => previous != current,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::profile::{
        profile_handle_by_id, GENERIC_MOVING_HEAD_PROFILE_ID, INTENSITY_ATTRIBUTE, PAN_ATTRIBUTE,
    };

    #[test]
    fn fixture_frames_start_from_profile_defaults() {
        let profile =
            profile_handle_by_id(GENERIC_MOVING_HEAD_PROFILE_ID).expect("moving head profile");
        let intensity = resolve_attribute(profile, INTENSITY_ATTRIBUTE).expect("intensity handle");
        let pan = resolve_attribute(profile, PAN_ATTRIBUTE).expect("pan handle");
        let frame = FixtureFrame::with_profile_defaults(7, profile);

        assert_eq!(frame.value(intensity), Some(&AttributeValue::Scalar(0.0)));
        assert_eq!(frame.value(pan), Some(&AttributeValue::Angle(0.0)));
        assert_eq!(frame.to_payload().attributes.len(), 7);
    }

    #[test]
    fn diff_uses_handles_and_attribute_value_tolerance() {
        let profile =
            profile_handle_by_id(GENERIC_MOVING_HEAD_PROFILE_ID).expect("moving head profile");
        let intensity = resolve_attribute(profile, INTENSITY_ATTRIBUTE).expect("intensity handle");
        let baseline = FixtureFrame::with_profile_defaults(1, profile);
        let mut below_tolerance = baseline.clone();
        below_tolerance.set(intensity, AttributeValue::Scalar(0.004));
        let mut changed = baseline.clone();
        changed.set(intensity, AttributeValue::Scalar(0.006));

        assert!(!frame_changed(&baseline, &below_tolerance));
        assert!(frame_changed(&baseline, &changed));
    }

    #[test]
    fn typed_interpolation_preserves_attribute_kinds() {
        assert_eq!(
            interpolate_attribute(
                &AttributeValue::Angle(-90.0),
                &AttributeValue::Angle(90.0),
                0.5,
            ),
            AttributeValue::Angle(0.0)
        );
        assert!(matches!(
            interpolate_attribute(
                &AttributeValue::Color([255, 0, 0]),
                &AttributeValue::Color([0, 0, 255]),
                0.5,
            ),
            AttributeValue::Color(_)
        ));
    }

    #[test]
    fn fixture_frames_reject_values_with_the_wrong_attribute_type() {
        let profile =
            profile_handle_by_id(GENERIC_MOVING_HEAD_PROFILE_ID).expect("moving head profile");
        let intensity = resolve_attribute(profile, INTENSITY_ATTRIBUTE).expect("intensity handle");
        let mut frame = FixtureFrame::with_profile_defaults(1, profile);

        assert!(!frame.set(intensity, AttributeValue::Angle(90.0)));
        assert_eq!(frame.value(intensity), Some(&AttributeValue::Scalar(0.0)));
    }
}
