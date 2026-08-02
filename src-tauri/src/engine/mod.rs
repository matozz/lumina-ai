pub mod animation;
pub mod attribute;
pub mod clock;
pub mod color;
pub mod frame;
pub mod mixer;
pub mod output;
pub mod phaser;
pub mod profile;
pub mod render;
pub mod timeline;
pub mod transport;

use crate::compiler::CompiledShow;
use crate::state::ActivePhaser;
use attribute::FixtureFrame;

pub fn compute_frame(
    _global_beat: f64, // we now rely on active.accumulated_beat instead for accurate phase
    active_phasers: &[ActivePhaser],
    compiled_show: &CompiledShow,
    parameter_context: &animation::ParameterContext,
) -> Vec<FixtureFrame> {
    let resolved: Vec<_> = active_phasers
        .iter()
        .map(|active| render::ResolvedPhaser {
            instance: active.id.clone().into(),
            phase: active.accumulated_beat,
        })
        .collect();
    render::render_resolved(compiled_show, &resolved, parameter_context)
}

pub fn compute_frame_diff(prev: &[FixtureFrame], curr: &[FixtureFrame]) -> Vec<FixtureFrame> {
    frame::diff_outputs_by_id(prev, curr)
}

#[cfg(test)]
mod tests {
    use super::compute_frame_diff;
    use crate::engine::attribute::{resolve_attribute, FixtureFrame};
    use crate::engine::profile::{
        profile_handle_by_id, AttributeValue, COLOR_RGB_ATTRIBUTE, GENERIC_RGB_PROFILE_ID,
        INTENSITY_ATTRIBUTE,
    };

    fn output(id: u32, color: [u8; 3], intensity: f32) -> FixtureFrame {
        let profile = profile_handle_by_id(GENERIC_RGB_PROFILE_ID).expect("RGB profile");
        let mut frame = FixtureFrame::with_profile_defaults(id, profile);
        frame.set(
            resolve_attribute(profile, COLOR_RGB_ATTRIBUTE).expect("color handle"),
            AttributeValue::Color(color),
        );
        frame.set(
            resolve_attribute(profile, INTENSITY_ATTRIBUTE).expect("intensity handle"),
            AttributeValue::Scalar(intensity),
        );
        frame
    }

    #[test]
    fn frame_diff_returns_only_changed_fixture_outputs() {
        let previous = vec![output(1, [255, 0, 0], 1.0), output(2, [0, 0, 0], 0.0)];
        let current = vec![output(1, [255, 0, 0], 1.0), output(2, [0, 0, 255], 0.75)];

        assert_eq!(
            compute_frame_diff(&previous, &current),
            vec![current[1].clone()]
        );
    }

    #[test]
    fn frame_diff_applies_existing_dimmer_change_tolerance() {
        let previous = vec![output(1, [255, 255, 255], 0.5)];
        let below_tolerance = vec![output(1, [255, 255, 255], 0.504)];
        let above_tolerance = vec![output(1, [255, 255, 255], 0.506)];

        assert!(compute_frame_diff(&previous, &below_tolerance).is_empty());
        assert_eq!(
            compute_frame_diff(&previous, &above_tolerance),
            above_tolerance
        );
    }

    #[test]
    fn frame_diff_includes_initial_fixture_outputs() {
        let current = vec![output(1, [255, 0, 0], 1.0)];

        assert_eq!(compute_frame_diff(&[], &current), current);
    }

    #[test]
    fn frame_diff_includes_appended_fixture_outputs() {
        let previous = vec![output(1, [255, 0, 0], 1.0)];
        let current = vec![output(1, [255, 0, 0], 1.0), output(2, [0, 0, 255], 0.75)];

        assert_eq!(
            compute_frame_diff(&previous, &current),
            vec![current[1].clone()]
        );
    }
}
