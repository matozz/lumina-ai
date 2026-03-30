pub mod phaser;
pub mod color;
pub mod sequence;
pub mod timeline;

use serde::Serialize;
use crate::compiler::CompiledShow;
use crate::state::ActivePhaser;
use rayon::prelude::*;

#[derive(Clone, Serialize)]
pub struct FixtureOutput {
    pub id: u32,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub dimmer: f32,
}

impl FixtureOutput {
    pub fn black(id: u32) -> Self {
        Self { id, r: 0, g: 0, b: 0, dimmer: 0.0 }
    }
}

pub fn compute_frame(
    _global_beat: f64, // we now rely on active.accumulated_beat instead for accurate phase
    active_phasers: &[ActivePhaser],
    compiled_show: &CompiledShow,
    parameter_context: &animation::ParameterContext,
) -> Vec<FixtureOutput> {
    compiled_show.fixtures.par_iter().map(|fixture| {
        let mut output = FixtureOutput::black(fixture.id);

        for active in active_phasers {
            if let Some(phaser) = compiled_show.phasers.get(&active.name) {
                if let Some(group) = compiled_show.groups.get(&phaser.target) {
                    let fixture_index = match group.index_of(fixture.id) {
                        Some(idx) => idx,
                        None => continue,
                    };

                    let block_info = group.block_index_of(fixture.id);

                    let phase_offset = phaser::calculate_phase(
                        fixture_index,
                        group.len(),
                        &phaser.phase,
                        block_info,
                    );

                    let total_width: f64 = phaser.steps.iter().map(|s| s.width).sum();
                    if total_width <= 0.0 { continue; }

                    // We compute the phase directly from the accumulated_beat, which correctly accounts for changing speeds over time
                    let cycle_position = ((active.accumulated_beat * 360.0)
                        + phase_offset) % 360.0;
                    
                    // to prevent negative module issues
                    let cycle_position = if cycle_position < 0.0 { cycle_position + 360.0 } else { cycle_position };

                    let normalized = cycle_position / 360.0 * total_width;

                    let (mut color, dimmer) = phaser::evaluate_phaser_at(
                        normalized, &phaser.steps, total_width
                    );
                    
                    // Apply dynamic color override if present in parameter_context
                    if let Some((r, g, b)) = parameter_context.get_color(&format!("phaser:{}.color", active.name)) {
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
    }).collect()
}

pub fn compute_frame_diff(
    prev: &[FixtureOutput],
    curr: &[FixtureOutput],
) -> Vec<FixtureOutput> {
    curr.iter().zip(prev.iter())
        .filter(|(c, p)| c.r != p.r || c.g != p.g || c.b != p.b
                       || (c.dimmer - p.dimmer).abs() > 0.005)
        .map(|(c, _)| c.clone())
        .collect()
}
pub mod animation;
