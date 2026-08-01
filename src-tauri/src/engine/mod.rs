pub mod animation;
pub mod clock;
pub mod color;
pub mod phaser;
pub mod timeline;
pub mod transport;

use crate::compiler::CompiledShow;
use crate::state::ActivePhaser;
use rayon::prelude::*;
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
    compiled_show
        .fixtures
        .par_iter()
        .map(|fixture| {
            let mut output = FixtureOutput::black(fixture.id);

            for active in active_phasers {
                if let Some(phaser) = compiled_show.phasers.get(&active.id) {
                    if let Some(group) = compiled_show.groups.get(&phaser.target) {
                        let fixture_index = match group.index_of(fixture.id) {
                            Some(idx) => idx,
                            None => continue,
                        };

                        let block_info = group.block_index_of(fixture.id);

                        let progress_delay = phaser::calculate_progress_delay(
                            fixture_index,
                            group.len(),
                            &phaser.phase,
                            block_info,
                        );

                        let total_width: f64 = phaser.steps.iter().map(|s| s.width).sum();
                        if total_width <= 0.0 {
                            continue;
                        }

                        // Calculate the raw cycle position based on beat and delay.
                        // By subtracting delay, we shift fixtures backwards in time.
                        let raw_cycle = active.accumulated_beat - progress_delay;

                        // If raw_cycle is negative, the fixture hasn't reached its first start time yet.
                        // This prevents wrapping artifacts on the very first frame so the wave physically enters.
                        if raw_cycle < 0.0 {
                            continue;
                        }

                        // Get the fractional part (0.0 to 1.0) which represents the position in the current loop cycle.
                        let cycle_progress = raw_cycle % 1.0;

                        let normalized = cycle_progress * total_width;

                        let (mut color, dimmer) =
                            phaser::evaluate_phaser_at(normalized, &phaser.steps, total_width);

                        // Apply dynamic color override if present in parameter_context
                        if let Some((r, g, b)) =
                            parameter_context.get_color(&format!("phaser:{}.color", active.id))
                        {
                            color = (r, g, b);
                        }

                        output.r = output.r.max(color.0);
                        output.g = output.g.max(color.1);
                        output.b = output.b.max(color.2);
                        output.dimmer = output.dimmer.max(dimmer);
                    }
                }
            }

            // Apply global master dimmer if present
            if let Some(global_dimmer) = parameter_context.get_float("global.master_dimmer") {
                output.dimmer *= global_dimmer as f32;
            }

            output
        })
        .collect()
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
