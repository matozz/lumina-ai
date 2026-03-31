use crate::compiler::{CompiledStep, PhaseConfig};
use crate::engine::color::lerp_color_lab;

pub fn calculate_progress_delay(
    fixture_index: usize,
    group_size: usize,
    config: &PhaseConfig,
    block_info: Option<(usize, usize)>,
) -> f64 {
    match config {
        PhaseConfig::Spread { from, to } => {
            let from_val = from / 100.0;
            let to_val = to / 100.0;
            
            if let Some((b_idx, total_blocks)) = block_info {
                if total_blocks <= 1 {
                    return 0.0;
                }
                let raw_delay = from_val + (to_val - from_val) * (b_idx as f64 / total_blocks as f64);
                let min_delay = if from_val <= to_val {
                    from_val
                } else {
                    from_val + (to_val - from_val) * ((total_blocks - 1) as f64 / total_blocks as f64)
                };
                raw_delay - min_delay
            } else {
                if group_size <= 1 {
                    return 0.0;
                }
                let raw_delay = from_val + (to_val - from_val) * (fixture_index as f64 / group_size as f64);
                let min_delay = if from_val <= to_val {
                    from_val
                } else {
                    from_val + (to_val - from_val) * ((group_size - 1) as f64 / group_size as f64)
                };
                raw_delay - min_delay
            }
        }
        PhaseConfig::Grouped {
            group_size: gs,
            spread,
        } => {
            let from_val = spread.0 / 100.0;
            let to_val = spread.1 / 100.0;

            if *gs == 0 {
                return 0.0;
            }

            if let Some((b_idx, total_blocks)) = block_info {
                let group_index = b_idx / gs;
                let total_groups = (total_blocks + gs - 1) / gs;
                if total_groups <= 1 {
                    return 0.0;
                }
                let raw_delay = from_val + (to_val - from_val) * (group_index as f64 / total_groups as f64);
                let min_delay = if from_val <= to_val {
                    from_val
                } else {
                    from_val + (to_val - from_val) * ((total_groups - 1) as f64 / total_groups as f64)
                };
                raw_delay - min_delay
            } else {
                let group_index = fixture_index / gs;
                let total_groups = (group_size + gs - 1) / gs;
                if total_groups <= 1 {
                    return 0.0;
                }
                let raw_delay = from_val + (to_val - from_val) * (group_index as f64 / total_groups as f64);
                let min_delay = if from_val <= to_val {
                    from_val
                } else {
                    from_val + (to_val - from_val) * ((total_groups - 1) as f64 / total_groups as f64)
                };
                raw_delay - min_delay
            }
        }
    }
}

pub fn evaluate_phaser_at(
    normalized_pos: f64,
    steps: &[CompiledStep],
    _total_width: f64,
) -> ((u8, u8, u8), f32) {
    if steps.is_empty() {
        return ((0, 0, 0), 0.0);
    }

    let mut accumulated = 0.0;

    for (i, step) in steps.iter().enumerate() {
        let step_width = step.width;

        if normalized_pos <= accumulated + step_width {
            let step_progress = if step_width > 0.0 {
                (normalized_pos - accumulated) / step_width
            } else {
                0.0
            };

            let prev_step = &steps[(i + steps.len() - 1) % steps.len()];
            let transition_ratio = step.transition / 100.0;

            if transition_ratio > 0.0 && step_progress <= transition_ratio {
                let t = step_progress / transition_ratio;
                let eased_t = apply_accel_decel(t, step.accel, step.decel);
                let color = lerp_color_lab(prev_step.color, step.color, eased_t);
                let dimmer = prev_step.dimmer + (step.dimmer - prev_step.dimmer) * eased_t as f32;
                return (color, dimmer);
            } else {
                return (step.color, step.dimmer);
            }
        }
        accumulated += step_width;
    }

    (steps[0].color, steps[0].dimmer)
}

fn apply_accel_decel(t: f64, accel: i32, decel: i32) -> f64 {
    let a = (accel as f64 + 100.0) / 300.0;
    let d = (decel as f64 + 100.0) / 300.0;
    cubic_bezier_y(t, a, 0.0, 1.0 - d, 1.0)
}

fn cubic_bezier_y(t: f64, cp1x: f64, cp1y: f64, cp2x: f64, cp2y: f64) -> f64 {
    let mut low = 0.0_f64;
    let mut high = 1.0_f64;
    for _ in 0..16 {
        let mid = (low + high) / 2.0;
        let x = bezier_component(mid, cp1x, cp2x);
        if x < t {
            low = mid;
        } else {
            high = mid;
        }
    }
    let t_prime = (low + high) / 2.0;
    bezier_component(t_prime, cp1y, cp2y)
}

fn bezier_component(t: f64, cp1: f64, cp2: f64) -> f64 {
    let t2 = t * t;
    let t3 = t2 * t;
    let mt = 1.0 - t;
    let mt2 = mt * mt;
    let mt3 = mt2 * mt;
    mt3 * 0.0 + 3.0 * mt2 * t * cp1 + 3.0 * mt * t2 * cp2 + t3 * 1.0
}
