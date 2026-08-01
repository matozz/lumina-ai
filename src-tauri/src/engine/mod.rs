pub mod animation;
pub mod clock;
pub mod color;
pub mod phaser;
pub mod render;
pub mod timeline;
pub mod transport;

use crate::compiler::CompiledShow;
use crate::state::ActivePhaser;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct FixtureOutput {
    pub id: u32,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub dimmer: f32,
}

impl FixtureOutput {
    pub fn black(id: u32) -> Self {
        Self {
            id,
            r: 0,
            g: 0,
            b: 0,
            dimmer: 0.0,
        }
    }
}

pub fn compute_frame(
    _global_beat: f64, // we now rely on active.accumulated_beat instead for accurate phase
    active_phasers: &[ActivePhaser],
    compiled_show: &CompiledShow,
    parameter_context: &animation::ParameterContext,
) -> Vec<FixtureOutput> {
    let resolved: Vec<_> = active_phasers
        .iter()
        .map(|active| render::ResolvedPhaser {
            id: active.id.clone(),
            phase: active.accumulated_beat,
        })
        .collect();
    render::render_resolved(compiled_show, &resolved, parameter_context)
}

pub fn compute_frame_diff(prev: &[FixtureOutput], curr: &[FixtureOutput]) -> Vec<FixtureOutput> {
    curr.iter()
        .zip(prev.iter())
        .filter(|(c, p)| {
            c.r != p.r || c.g != p.g || c.b != p.b || (c.dimmer - p.dimmer).abs() > 0.005
        })
        .map(|(c, _)| c.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{compute_frame_diff, FixtureOutput};

    fn output(id: u32, color: (u8, u8, u8), dimmer: f32) -> FixtureOutput {
        FixtureOutput {
            id,
            r: color.0,
            g: color.1,
            b: color.2,
            dimmer,
        }
    }

    #[test]
    fn frame_diff_returns_only_changed_fixture_outputs() {
        let previous = vec![output(1, (255, 0, 0), 1.0), output(2, (0, 0, 0), 0.0)];
        let current = vec![output(1, (255, 0, 0), 1.0), output(2, (0, 0, 255), 0.75)];

        assert_eq!(
            compute_frame_diff(&previous, &current),
            vec![current[1].clone()]
        );
    }

    #[test]
    fn frame_diff_applies_existing_dimmer_change_tolerance() {
        let previous = vec![output(1, (255, 255, 255), 0.5)];
        let below_tolerance = vec![output(1, (255, 255, 255), 0.504)];
        let above_tolerance = vec![output(1, (255, 255, 255), 0.506)];

        assert!(compute_frame_diff(&previous, &below_tolerance).is_empty());
        assert_eq!(
            compute_frame_diff(&previous, &above_tolerance),
            above_tolerance
        );
    }

    #[test]
    fn baseline_frame_diff_drops_initial_fixture_outputs() {
        let current = vec![output(1, (255, 0, 0), 1.0)];

        assert!(
            compute_frame_diff(&[], &current).is_empty(),
            "Stage 1 must replace this characterization with a full-frame assertion"
        );
    }

    #[test]
    fn baseline_frame_diff_drops_appended_fixture_outputs() {
        let previous = vec![output(1, (255, 0, 0), 1.0)];
        let current = vec![output(1, (255, 0, 0), 1.0), output(2, (0, 0, 255), 0.75)];

        assert!(
            compute_frame_diff(&previous, &current).is_empty(),
            "Stage 1 must replace this characterization with a topology full-frame assertion"
        );
    }
}
