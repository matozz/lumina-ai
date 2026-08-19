pub mod animation;
pub mod attribute;
pub mod clock;
pub mod color;
pub mod effect;
pub mod frame;
pub mod mixer;
pub mod musical_time;
pub mod output;
pub mod profile;
pub mod render;
pub mod temporal;
pub mod timeline;
pub mod transport;

use crate::compiler::CompiledShow;
use crate::state::ActivePhaser;
use attribute::FixtureFrame;

pub fn compute_frame(
    global_beat: f64,
    active_phasers: &[ActivePhaser],
    compiled_show: &CompiledShow,
    parameter_context: &animation::ParameterContext,
) -> Vec<FixtureFrame> {
    let resolved: Vec<_> = active_phasers
        .iter()
        .enumerate()
        .map(|(index, active)| {
            let ppq = compiled_show
                .timeline
                .as_ref()
                .map_or(960, |timeline| timeline.ppq);
            let targeting_tick =
                ((global_beat - active.start_beat).max(0.0) * f64::from(ppq)).round() as u64;
            let phase = compiled_show
                .effect_instances
                .get(&active.id)
                .and_then(|instance| instance.targeting_scene.as_ref())
                .and_then(|scene| scene.phase_reset_start_tick(targeting_tick))
                .map_or(active.accumulated_beat, |phase_start_tick| {
                    targeting_tick.saturating_sub(phase_start_tick) as f64 / f64::from(ppq)
                        * active.multiplier
                });
            render::ResolvedPhaser {
                source_id: active.id.clone(),
                instance: active.id.clone().into(),
                phase,
                layer: 0,
                weight: None,
                activation_order: index as u64,
                stable_source_order: u32::try_from(index).unwrap_or(u32::MAX),
                targeting_tick,
            }
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
