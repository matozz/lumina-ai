use super::animation::{ease, AnimatableValue, ParameterContext};
use super::phaser::{calculate_progress_delay, evaluate_phaser_at};
use super::FixtureOutput;
use crate::compiler::parser::{TimelineActionDefDSL, TimelineEventDSL};
use crate::compiler::CompiledShow;
use rayon::prelude::*;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RenderTime {
    pub beat: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LivePhaser {
    pub id: String,
    pub start_beat: f64,
    pub phase_offset: f64,
    pub multiplier: f64,
}

impl LivePhaser {
    pub fn phase_at(&self, time: RenderTime) -> f64 {
        self.phase_offset + (time.beat - self.start_beat).max(0.0) * self.multiplier
    }
}

#[derive(Clone, Copy, Debug)]
pub enum RenderSource<'a> {
    Timeline,
    Live(&'a [LivePhaser]),
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ResolvedPhaser {
    pub id: String,
    pub phase: f64,
}

pub fn render_at(
    show: &CompiledShow,
    time: RenderTime,
    source: RenderSource<'_>,
) -> Vec<FixtureOutput> {
    let (active_phasers, parameters) = match source {
        RenderSource::Timeline => resolve_timeline_at(show, time),
        RenderSource::Live(active) => (
            active
                .iter()
                .map(|phaser| ResolvedPhaser {
                    id: phaser.id.clone(),
                    phase: phaser.phase_at(time),
                })
                .collect(),
            ParameterContext::new(),
        ),
    };

    render_resolved(show, &active_phasers, &parameters)
}

pub(crate) fn render_resolved(
    show: &CompiledShow,
    active_phasers: &[ResolvedPhaser],
    parameters: &ParameterContext,
) -> Vec<FixtureOutput> {
    show.fixtures
        .par_iter()
        .map(|fixture| {
            let mut output = FixtureOutput::black(fixture.id);

            for active in active_phasers {
                let Some(phaser) = show.phasers.get(&active.id) else {
                    continue;
                };
                let Some(group) = show.groups.get(&phaser.target) else {
                    continue;
                };
                let Some(fixture_index) = group.index_of(fixture.id) else {
                    continue;
                };

                let progress_delay = calculate_progress_delay(
                    fixture_index,
                    group.len(),
                    &phaser.phase,
                    group.block_index_of(fixture.id),
                );
                let total_width: f64 = phaser.steps.iter().map(|step| step.width).sum();
                if total_width <= 0.0 {
                    continue;
                }

                let raw_cycle = active.phase - progress_delay;
                if raw_cycle < 0.0 {
                    continue;
                }

                let normalized = (raw_cycle % 1.0) * total_width;
                let (mut color, dimmer) =
                    evaluate_phaser_at(normalized, &phaser.steps, total_width);

                if let Some(override_color) =
                    parameters.get_color(&format!("phaser:{}.color", active.id))
                {
                    color = override_color;
                }

                output.r = output.r.max(color.0);
                output.g = output.g.max(color.1);
                output.b = output.b.max(color.2);
                output.dimmer = output.dimmer.max(dimmer);
            }

            if let Some(global_dimmer) = parameters.get_float("global.master_dimmer") {
                output.dimmer *= global_dimmer as f32;
            }

            output
        })
        .collect()
}

fn resolve_timeline_at(
    show: &CompiledShow,
    time: RenderTime,
) -> (Vec<ResolvedPhaser>, ParameterContext) {
    let Some(timeline) = &show.timeline else {
        return (Vec::new(), ParameterContext::new());
    };

    let mut active_phasers = Vec::new();
    for event in &timeline.events {
        let TimelineActionDefDSL::Phaser { phaser } = &event.action else {
            continue;
        };
        if !event_is_active(event, time.beat) {
            continue;
        }

        let default_multiplier = show
            .phasers
            .get(phaser)
            .and_then(|compiled| compiled.multiplier)
            .unwrap_or(1.0);
        let target = format!("phaser:{phaser}.multiplier");
        active_phasers.push(ResolvedPhaser {
            id: phaser.clone(),
            phase: integrate_float_parameter(
                &timeline.events,
                &target,
                event.beat,
                time.beat,
                default_multiplier,
            ),
        });
    }

    let mut parameters = ParameterContext::new();
    let mut resolved_parameters: HashMap<&str, (f64, usize, AnimatableValue)> = HashMap::new();
    for (index, event) in timeline.events.iter().enumerate() {
        let TimelineActionDefDSL::Animate {
            target,
            from,
            to,
            easing,
        } = &event.action
        else {
            continue;
        };
        if event.beat > time.beat {
            continue;
        }
        let Some(value) = evaluate_animation_at(event, from, to, easing.as_deref(), time.beat)
        else {
            continue;
        };

        let replace =
            resolved_parameters
                .get(target.as_str())
                .is_none_or(|(start, previous_index, _)| {
                    event.beat > *start || (event.beat == *start && index > *previous_index)
                });
        if replace {
            resolved_parameters.insert(target, (event.beat, index, value));
        }
    }
    for (target, (_, _, value)) in resolved_parameters {
        parameters.write_value(target, value);
    }

    (active_phasers, parameters)
}

fn event_is_active(event: &TimelineEventDSL, beat: f64) -> bool {
    if beat < event.beat {
        return false;
    }
    event
        .duration
        .is_none_or(|duration| beat < event.beat + duration)
}

fn evaluate_animation_at(
    event: &TimelineEventDSL,
    from: &serde_json::Value,
    to: &serde_json::Value,
    easing: Option<&str>,
    beat: f64,
) -> Option<AnimatableValue> {
    let start = AnimatableValue::from_json(from)?;
    let end = AnimatableValue::from_json(to)?;
    let duration = event.duration.unwrap_or(0.0);
    if duration <= 0.0 || beat >= event.beat + duration {
        return Some(end);
    }

    let progress = ((beat - event.beat) / duration).clamp(0.0, 1.0);
    Some(start.lerp(&end, ease(progress, easing.unwrap_or("linear"))))
}

fn integrate_float_parameter(
    events: &[TimelineEventDSL],
    target: &str,
    from_beat: f64,
    to_beat: f64,
    default_value: f64,
) -> f64 {
    if to_beat <= from_beat {
        return 0.0;
    }

    let matching: Vec<_> = events
        .iter()
        .enumerate()
        .filter_map(|(index, event)| match &event.action {
            TimelineActionDefDSL::Animate {
                target: event_target,
                from,
                to,
                easing,
            } if event_target == target => Some((index, event, from, to, easing.as_deref())),
            _ => None,
        })
        .collect();

    let mut boundaries = vec![from_beat, to_beat];
    for (_, event, _, _, _) in &matching {
        if event.beat > from_beat && event.beat < to_beat {
            boundaries.push(event.beat);
        }
        if let Some(duration) = event.duration {
            let end = event.beat + duration;
            if end > from_beat && end < to_beat {
                boundaries.push(end);
            }
        }
    }
    boundaries.sort_by(f64::total_cmp);
    boundaries.dedup_by(|left, right| (*left - *right).abs() < f64::EPSILON);

    boundaries
        .windows(2)
        .map(|window| {
            let start = window[0];
            let end = window[1];
            let midpoint = start + (end - start) / 2.0;
            let selected = matching
                .iter()
                .filter(|(_, event, _, _, _)| event.beat <= midpoint)
                .max_by(
                    |(left_index, left, _, _, _), (right_index, right, _, _, _)| {
                        left.beat
                            .total_cmp(&right.beat)
                            .then(left_index.cmp(right_index))
                    },
                );

            selected.map_or(
                default_value * (end - start),
                |(_, event, from, to, easing)| {
                    integrate_animation_segment(event, from, to, *easing, start, end)
                        .unwrap_or(default_value * (end - start))
                },
            )
        })
        .sum()
}

fn integrate_animation_segment(
    event: &TimelineEventDSL,
    from: &serde_json::Value,
    to: &serde_json::Value,
    easing: Option<&str>,
    segment_start: f64,
    segment_end: f64,
) -> Option<f64> {
    let start_value = from.as_f64()?;
    let end_value = to.as_f64()?;
    let duration = event.duration.unwrap_or(0.0);
    if duration <= 0.0 || segment_start >= event.beat + duration {
        return Some(end_value * (segment_end - segment_start));
    }

    let normalized_start = ((segment_start - event.beat) / duration).clamp(0.0, 1.0);
    let normalized_end = ((segment_end - event.beat) / duration).clamp(0.0, 1.0);
    let constant = start_value * (segment_end - segment_start);
    let eased_area = duration
        * (easing_antiderivative(normalized_end, easing.unwrap_or("linear"))
            - easing_antiderivative(normalized_start, easing.unwrap_or("linear")));
    Some(constant + (end_value - start_value) * eased_area)
}

fn easing_antiderivative(value: f64, easing: &str) -> f64 {
    let value = value.clamp(0.0, 1.0);
    match easing {
        "ease_in" => value.powi(3) / 3.0,
        "ease_out" => value.powi(2) - value.powi(3) / 3.0,
        "ease_in_out" if value < 0.5 => 2.0 * value.powi(3) / 3.0,
        "ease_in_out" => -value + 2.0 * value.powi(2) - 2.0 * value.powi(3) / 3.0 + 1.0 / 6.0,
        _ => value.powi(2) / 2.0,
    }
}

#[cfg(test)]
mod tests {
    use super::{integrate_float_parameter, render_at, RenderSource, RenderTime};
    use crate::compiler::{parser::ShowDSL, Compiler};
    use crate::engine::FixtureOutput;

    fn compiled_show() -> crate::compiler::CompiledShow {
        let dsl: ShowDSL = serde_json::from_str(
            r##"{
                "meta": { "name": "render at" },
                "patch": [{ "type": "pixel", "id_range": [1, 1] }],
                "layout": { "type": "generator", "generator": {
                    "shape": "matrix", "rows": 1, "columns": 1, "spacing": 1
                }},
                "groups": [{ "name": "All", "fixtures": [1] }],
                "phasers": [{
                    "id": "pulse", "name": "Pulse", "target": "All", "multiplier": 1,
                    "steps": [
                        { "values": { "color": "#ffffff", "dimmer": 1 }, "width": 50, "transition": 0 },
                        { "values": { "color": "#000000", "dimmer": 0 }, "width": 50, "transition": 0 }
                    ],
                    "phase": { "mode": "spread", "spread": { "from": 0, "to": 0 } }
                }],
                "timeline": { "events": [
                    { "beat": 0, "duration": 4, "action": { "type": "phaser", "phaser": "pulse" } },
                    { "beat": 0, "duration": 2, "action": {
                        "type": "animate", "target": "phaser:pulse.multiplier",
                        "from": 1, "to": 3, "easing": "linear"
                    }},
                    { "beat": 0, "duration": 2, "action": {
                        "type": "animate", "target": "global.master_dimmer",
                        "from": 1, "to": 0.5, "easing": "linear"
                    }}
                ]}
            }"##,
        )
        .expect("test DSL");
        Compiler::compile(dsl).expect("compiled test show")
    }

    #[test]
    fn multiplier_automation_is_integrated_over_musical_time() {
        let show = compiled_show();
        let events = &show.timeline.as_ref().expect("timeline").events;

        assert_eq!(
            integrate_float_parameter(events, "phaser:pulse.multiplier", 0.0, 1.0, 1.0),
            1.5
        );
        assert_eq!(
            integrate_float_parameter(events, "phaser:pulse.multiplier", 0.0, 2.0, 1.0),
            4.0
        );
        assert_eq!(
            integrate_float_parameter(events, "phaser:pulse.multiplier", 0.0, 3.0, 1.0),
            7.0
        );
    }

    #[test]
    fn repeated_render_and_seek_produce_the_same_frame() {
        let show = compiled_show();
        let target = RenderTime { beat: 1.25 };
        let direct = render_at(&show, target, RenderSource::Timeline);

        for step in 0..75 {
            let _ = render_at(
                &show,
                RenderTime {
                    beat: f64::from(step) / 60.0,
                },
                RenderSource::Timeline,
            );
        }
        let after_sequential_render = render_at(&show, target, RenderSource::Timeline);

        assert_eq!(direct, after_sequential_render);
        assert_eq!(
            direct,
            vec![FixtureOutput {
                id: 1,
                r: 255,
                g: 255,
                b: 255,
                dimmer: 0.6875,
            }]
        );
    }

    #[test]
    fn timeline_event_end_rebuilds_to_blackout() {
        let show = compiled_show();
        assert_eq!(
            render_at(&show, RenderTime { beat: 4.0 }, RenderSource::Timeline),
            vec![FixtureOutput::black(1)]
        );
    }
}
