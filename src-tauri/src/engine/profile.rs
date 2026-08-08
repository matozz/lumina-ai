use serde::Serialize;
use std::sync::LazyLock;

pub const GENERIC_RGB_PROFILE_ID: &str = "generic-rgb";
pub const GENERIC_RGBW_PROFILE_ID: &str = "generic-rgbw";
pub const GENERIC_MOVING_HEAD_PROFILE_ID: &str = "generic-moving-head";

pub const INTENSITY_ATTRIBUTE: &str = "intensity";
pub const COLOR_RGB_ATTRIBUTE: &str = "color.rgb";
pub const COLOR_WHITE_ATTRIBUTE: &str = "color.white";
pub const PAN_ATTRIBUTE: &str = "position.pan";
pub const TILT_ATTRIBUTE: &str = "position.tilt";
pub const ZOOM_ATTRIBUTE: &str = "beam.zoom";
pub const STROBE_ATTRIBUTE: &str = "beam.strobe";
pub const GOBO_ATTRIBUTE: &str = "beam.gobo";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct FixtureProfileHandle(usize);

impl FixtureProfileHandle {
    pub const fn index(self) -> usize {
        self.0
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct FixtureProfile {
    pub id: String,
    pub name: String,
    pub preview_kind: PreviewKind,
    pub attributes: Vec<AttributeDescriptor>,
}

impl FixtureProfile {
    pub fn attribute(&self, id: &str) -> Option<&AttributeDescriptor> {
        self.attributes.iter().find(|attribute| attribute.id == id)
    }

    pub fn channel_footprint(&self) -> u16 {
        self.attributes
            .iter()
            .flat_map(|attribute| attribute.output_mapping.channel_offsets.iter().copied())
            .max()
            .map_or(0, |maximum| maximum + 1)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PreviewKind {
    Pixel,
    MovingHead,
}

impl PreviewKind {
    pub const fn canvas_type(self) -> &'static str {
        match self {
            Self::Pixel => "pixel",
            Self::MovingHead => "spot",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AttributeDescriptor {
    pub id: String,
    pub value_type: AttributeValueType,
    pub physical_range: Option<PhysicalRange>,
    pub default_value: AttributeValue,
    pub mix_policy: MixPolicy,
    pub output_mapping: ProtocolMapping,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AttributeValueType {
    Scalar,
    Color,
    Angle,
    Enum,
    Boolean,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
pub enum AttributeValue {
    Scalar(f32),
    Color([u8; 3]),
    Angle(f32),
    Enum(String),
    Boolean(bool),
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PhysicalRange {
    pub min: f32,
    pub max: f32,
    pub unit: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MixPolicy {
    Htp,
    Ltp,
    Add,
    Multiply,
    Mask,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ProtocolMapping {
    pub channel_offsets: Vec<u16>,
    pub encoding: OutputEncoding,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OutputEncoding {
    Scalar8,
    Scalar16,
    Rgb8,
    Enum8,
    Boolean8,
}

static BUILTIN_PROFILES: LazyLock<Vec<FixtureProfile>> = LazyLock::new(|| {
    vec![
        generic_rgb_profile(),
        generic_rgbw_profile(),
        generic_moving_head_profile(),
    ]
});

pub fn builtin_profiles() -> &'static [FixtureProfile] {
    &BUILTIN_PROFILES
}

pub fn profile_handle_by_id(id: &str) -> Option<FixtureProfileHandle> {
    BUILTIN_PROFILES
        .iter()
        .position(|profile| profile.id == id)
        .map(FixtureProfileHandle)
}

pub fn profile_by_handle(handle: FixtureProfileHandle) -> &'static FixtureProfile {
    &BUILTIN_PROFILES[handle.0]
}

pub fn profile_by_id(id: &str) -> Option<&'static FixtureProfile> {
    profile_handle_by_id(id).map(profile_by_handle)
}

fn generic_rgb_profile() -> FixtureProfile {
    FixtureProfile {
        id: GENERIC_RGB_PROFILE_ID.to_string(),
        name: "Generic RGB".to_string(),
        preview_kind: PreviewKind::Pixel,
        attributes: vec![intensity(0), color_rgb([1, 2, 3])],
    }
}

fn generic_rgbw_profile() -> FixtureProfile {
    FixtureProfile {
        id: GENERIC_RGBW_PROFILE_ID.to_string(),
        name: "Generic RGBW".to_string(),
        preview_kind: PreviewKind::Pixel,
        attributes: vec![
            intensity(0),
            color_rgb([1, 2, 3]),
            scalar_attribute(
                COLOR_WHITE_ATTRIBUTE,
                PhysicalRange {
                    min: 0.0,
                    max: 1.0,
                    unit: "normalized".to_string(),
                },
                0.0,
                MixPolicy::Ltp,
                ProtocolMapping {
                    channel_offsets: vec![4],
                    encoding: OutputEncoding::Scalar8,
                },
            ),
        ],
    }
}

fn generic_moving_head_profile() -> FixtureProfile {
    FixtureProfile {
        id: GENERIC_MOVING_HEAD_PROFILE_ID.to_string(),
        name: "Generic Moving Head".to_string(),
        preview_kind: PreviewKind::MovingHead,
        attributes: vec![
            angle_attribute(PAN_ATTRIBUTE, -270.0, 270.0, 0.0, vec![0, 1]),
            angle_attribute(TILT_ATTRIBUTE, -135.0, 135.0, 0.0, vec![2, 3]),
            intensity(4),
            color_rgb([5, 6, 7]),
            angle_attribute(ZOOM_ATTRIBUTE, 5.0, 60.0, 30.0, vec![8]),
            scalar_attribute(
                STROBE_ATTRIBUTE,
                PhysicalRange {
                    min: 0.0,
                    max: 20.0,
                    unit: "hertz".to_string(),
                },
                0.0,
                MixPolicy::Ltp,
                ProtocolMapping {
                    channel_offsets: vec![9],
                    encoding: OutputEncoding::Scalar8,
                },
            ),
            AttributeDescriptor {
                id: GOBO_ATTRIBUTE.to_string(),
                value_type: AttributeValueType::Enum,
                physical_range: None,
                default_value: AttributeValue::Enum("open".to_string()),
                mix_policy: MixPolicy::Ltp,
                output_mapping: ProtocolMapping {
                    channel_offsets: vec![10],
                    encoding: OutputEncoding::Enum8,
                },
            },
        ],
    }
}

fn intensity(channel_offset: u16) -> AttributeDescriptor {
    scalar_attribute(
        INTENSITY_ATTRIBUTE,
        PhysicalRange {
            min: 0.0,
            max: 1.0,
            unit: "normalized".to_string(),
        },
        0.0,
        MixPolicy::Htp,
        ProtocolMapping {
            channel_offsets: vec![channel_offset],
            encoding: OutputEncoding::Scalar8,
        },
    )
}

fn color_rgb(channel_offsets: [u16; 3]) -> AttributeDescriptor {
    AttributeDescriptor {
        id: COLOR_RGB_ATTRIBUTE.to_string(),
        value_type: AttributeValueType::Color,
        physical_range: None,
        default_value: AttributeValue::Color([0, 0, 0]),
        mix_policy: MixPolicy::Ltp,
        output_mapping: ProtocolMapping {
            channel_offsets: channel_offsets.to_vec(),
            encoding: OutputEncoding::Rgb8,
        },
    }
}

fn scalar_attribute(
    id: &str,
    physical_range: PhysicalRange,
    default: f32,
    mix_policy: MixPolicy,
    output_mapping: ProtocolMapping,
) -> AttributeDescriptor {
    AttributeDescriptor {
        id: id.to_string(),
        value_type: AttributeValueType::Scalar,
        physical_range: Some(physical_range),
        default_value: AttributeValue::Scalar(default),
        mix_policy,
        output_mapping,
    }
}

fn angle_attribute(
    id: &str,
    min: f32,
    max: f32,
    default: f32,
    channel_offsets: Vec<u16>,
) -> AttributeDescriptor {
    AttributeDescriptor {
        id: id.to_string(),
        value_type: AttributeValueType::Angle,
        physical_range: Some(PhysicalRange {
            min,
            max,
            unit: "degrees".to_string(),
        }),
        default_value: AttributeValue::Angle(default),
        mix_policy: MixPolicy::Ltp,
        output_mapping: ProtocolMapping {
            encoding: if channel_offsets.len() == 2 {
                OutputEncoding::Scalar16
            } else {
                OutputEncoding::Scalar8
            },
            channel_offsets,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn builtin_profiles_have_unique_capabilities_and_protocol_channels() {
        assert_eq!(builtin_profiles().len(), 3);
        for profile in builtin_profiles() {
            let mut attribute_ids = HashSet::new();
            let mut channel_offsets = HashSet::new();
            for attribute in &profile.attributes {
                assert!(attribute_ids.insert(attribute.id.as_str()));
                for channel_offset in &attribute.output_mapping.channel_offsets {
                    assert!(channel_offsets.insert(*channel_offset));
                }
            }
            assert_eq!(profile.channel_footprint(), channel_offsets.len() as u16);
            assert_eq!(
                profile
                    .attribute(INTENSITY_ATTRIBUTE)
                    .map(|value| value.mix_policy),
                Some(MixPolicy::Htp)
            );
            assert_eq!(
                profile
                    .attribute(COLOR_RGB_ATTRIBUTE)
                    .map(|value| value.mix_policy),
                Some(MixPolicy::Ltp)
            );
        }
    }

    #[test]
    fn moving_head_declares_physical_pan_and_tilt_ranges() {
        let profile = profile_by_id(GENERIC_MOVING_HEAD_PROFILE_ID).expect("moving head profile");
        let pan = profile.attribute(PAN_ATTRIBUTE).expect("pan capability");
        let tilt = profile.attribute(TILT_ATTRIBUTE).expect("tilt capability");

        assert_eq!(pan.value_type, AttributeValueType::Angle);
        assert_eq!(
            pan.physical_range
                .as_ref()
                .map(|range| (range.min, range.max)),
            Some((-270.0, 270.0))
        );
        assert_eq!(tilt.output_mapping.channel_offsets, vec![2, 3]);
        assert_eq!(profile.channel_footprint(), 11);
    }

    #[test]
    fn profile_handles_resolve_without_runtime_string_parsing() {
        let handle = profile_handle_by_id(GENERIC_RGBW_PROFILE_ID).expect("RGBW profile handle");

        assert_eq!(profile_by_handle(handle).id, GENERIC_RGBW_PROFILE_ID);
        assert_eq!(handle.index(), 1);
        assert!(profile_handle_by_id("unknown-profile").is_none());
    }
}
