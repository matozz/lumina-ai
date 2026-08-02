use crate::compiler::{CompiledStep, PhaseConfig};
use crate::engine::attribute::interpolate_attribute;
use crate::engine::profile::AttributeValue;

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
                let raw_delay =
                    from_val + (to_val - from_val) * (b_idx as f64 / total_blocks as f64);
                let min_delay = if from_val <= to_val {
                    from_val
                } else {
                    from_val
                        + (to_val - from_val) * ((total_blocks - 1) as f64 / total_blocks as f64)
                };
                raw_delay - min_delay
            } else {
                if group_size <= 1 {
                    return 0.0;
                }
                let raw_delay =
                    from_val + (to_val - from_val) * (fixture_index as f64 / group_size as f64);
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
                let total_groups = total_blocks.div_ceil(*gs);
                if total_groups <= 1 {
                    return 0.0;
                }
                let raw_delay =
                    from_val + (to_val - from_val) * (group_index as f64 / total_groups as f64);
                let min_delay = if from_val <= to_val {
                    from_val
                } else {
                    from_val
                        + (to_val - from_val) * ((total_groups - 1) as f64 / total_groups as f64)
                };
                raw_delay - min_delay
            } else {
                let group_index = fixture_index / gs;
                let total_groups = group_size.div_ceil(*gs);
                if total_groups <= 1 {
                    return 0.0;
                }
                let raw_delay =
                    from_val + (to_val - from_val) * (group_index as f64 / total_groups as f64);
                let min_delay = if from_val <= to_val {
                    from_val
                } else {
                    from_val
                        + (to_val - from_val) * ((total_groups - 1) as f64 / total_groups as f64)
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
) -> Vec<Option<AttributeValue>> {
    if steps.is_empty() {
        return Vec::new();
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
                return prev_step
                    .values
                    .iter()
                    .zip(&step.values)
                    .map(|(previous, current)| match (previous, current) {
                        (Some(previous), Some(current)) => {
                            Some(interpolate_attribute(previous, current, eased_t))
                        }
                        (_, Some(current)) => Some(current.clone()),
                        _ => None,
                    })
                    .collect();
            } else {
                return step.values.clone();
            }
        }
        accumulated += step_width;
    }

    steps[0].values.clone()
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

#[cfg(test)]
mod tests {
    use super::{calculate_progress_delay, evaluate_phaser_at};
    use crate::compiler::{CompiledStep, PhaseConfig};
    use crate::engine::profile::AttributeValue;

    fn step(color: [u8; 3], dimmer: f32) -> CompiledStep {
        CompiledStep {
            values: vec![
                Some(AttributeValue::Color(color)),
                Some(AttributeValue::Scalar(dimmer)),
            ],
            width: 50.0,
            transition: 0.0,
            accel: 0,
            decel: 0,
        }
    }

    #[test]
    fn spread_delay_tracks_fixture_and_sort_block_positions() {
        let config = PhaseConfig::Spread {
            from: 0.0,
            to: 100.0,
        };

        assert_eq!(calculate_progress_delay(0, 3, &config, None), 0.0);
        assert!((calculate_progress_delay(1, 3, &config, None) - 1.0 / 3.0).abs() < 1e-12);
        assert!((calculate_progress_delay(2, 3, &config, Some((1, 2))) - 0.5).abs() < 1e-12);
    }

    #[test]
    fn grouped_delay_keeps_members_of_a_group_in_phase() {
        let config = PhaseConfig::Grouped {
            group_size: 2,
            spread: (0.0, 100.0),
        };

        assert_eq!(calculate_progress_delay(0, 4, &config, None), 0.0);
        assert_eq!(calculate_progress_delay(1, 4, &config, None), 0.0);
        assert!((calculate_progress_delay(2, 4, &config, None) - 0.5).abs() < 1e-12);
        assert!((calculate_progress_delay(3, 4, &config, None) - 0.5).abs() < 1e-12);
    }

    #[test]
    fn evaluates_step_color_and_dimmer_at_known_cycle_positions() {
        let steps = vec![step([255, 0, 0], 1.0), step([0, 0, 255], 0.25)];

        assert_eq!(evaluate_phaser_at(25.0, &steps, 100.0), steps[0].values);
        assert_eq!(evaluate_phaser_at(75.0, &steps, 100.0), steps[1].values);
    }
}
