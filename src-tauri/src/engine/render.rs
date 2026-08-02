use super::animation::{ease, AnimatableValue, ParameterContext};
use super::attribute::{AttributeHandle, FixtureFrame};
use super::mixer::{mix_fixture, AttributeWrite};
use super::phaser::{calculate_progress_delay, evaluate_phaser_at};
use crate::compiler::{
    CompiledAutomationTarget, CompiledEffectParameter, CompiledShow, CompiledTimelineAction,
    CompiledTimelineEvent, EffectInstanceHandle,
};
use crate::engine::profile::AttributeValue;
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
    pub instance: EffectInstanceHandle,
    pub phase: f64,
}

pub fn render_at(
    show: &CompiledShow,
    time: RenderTime,
    source: RenderSource<'_>,
) -> Vec<FixtureFrame> {
    let (active_phasers, parameters) = match source {
        RenderSource::Timeline => resolve_timeline_at(show, time),
        RenderSource::Live(active) => (
            active
                .iter()
                .filter(|phaser| show.phasers.contains_key(&phaser.id))
                .map(|phaser| ResolvedPhaser {
                    instance: phaser.id.clone().into(),
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
) -> Vec<FixtureFrame> {
    show.fixtures
        .par_iter()
        .map(|fixture| {
            let output = FixtureFrame::with_profile_defaults(fixture.id, fixture.profile);
            let mut writes = Vec::new();

            for (source_order, active) in active_phasers.iter().enumerate() {
                let Some(phaser) = show.phasers.get(active.instance.as_str()) else {
                    continue;
                };
                let Some(group) = show.groups.get(phaser.target.as_str()) else {
                    continue;
                };
                let Some(fixture_index) = group.index_of(fixture.id) else {
                    continue;
                };
                let Some(profile_phaser) = phaser.profile_steps.get(&fixture.profile) else {
                    continue;
                };

                let progress_delay = calculate_progress_delay(
                    fixture_index,
                    group.len(),
                    &phaser.phase,
                    group.block_index_of(fixture.id),
                );
                let total_width: f64 = profile_phaser.steps.iter().map(|step| step.width).sum();
                if total_width <= 0.0 {
                    continue;
                }

                let raw_cycle = active.phase - progress_delay;
                if raw_cycle < 0.0 {
                    continue;
                }

                let normalized = (raw_cycle % 1.0) * total_width;
                let mut values = evaluate_phaser_at(normalized, &profile_phaser.steps, total_width);

                if let (Some(handle), Some((red, green, blue))) = (
                    profile_phaser.color,
                    parameters.get_effect_color(&active.instance, CompiledEffectParameter::Color),
                ) {
                    values[handle.index()] = Some(AttributeValue::Color([red, green, blue]));
                }
                apply_scalar_override(
                    &mut values,
                    profile_phaser.intensity,
                    parameters.get_effect_float(&active.instance, CompiledEffectParameter::Dimmer),
                    AttributeValue::Scalar,
                );
                apply_scalar_override(
                    &mut values,
                    profile_phaser.pan,
                    parameters.get_effect_float(&active.instance, CompiledEffectParameter::Pan),
                    AttributeValue::Angle,
                );
                apply_scalar_override(
                    &mut values,
                    profile_phaser.tilt,
                    parameters.get_effect_float(&active.instance, CompiledEffectParameter::Tilt),
                    AttributeValue::Angle,
                );

                for (index, value) in values.into_iter().enumerate() {
                    let (Some(handle), Some(value)) = (AttributeHandle::from_index(index), value)
                    else {
                        continue;
                    };
                    writes.push(AttributeWrite {
                        attribute: handle,
                        value,
                        source_id: active.instance.as_str(),
                        layer: 0,
                        priority: 0,
                        activation_order: source_order as u64,
                        stable_source_order: u32::try_from(source_order).unwrap_or(u32::MAX),
                        weight: None,
                        policy_override: None,
                    });
                }
            }

            let mut output = mix_fixture(output, writes, false).frame;

            if let (Some(handle), Some(global_dimmer)) =
                (fixture.intensity, parameters.global_master_dimmer())
            {
                if let Some(AttributeValue::Scalar(intensity)) = output.value(handle).cloned() {
                    output.set(
                        handle,
                        AttributeValue::Scalar(intensity * global_dimmer as f32),
                    );
                }
            }

            output
        })
        .collect()
}

fn apply_scalar_override(
    values: &mut [Option<AttributeValue>],
    handle: Option<AttributeHandle>,
    value: Option<f64>,
    convert: impl FnOnce(f32) -> AttributeValue,
) {
    if let (Some(handle), Some(value)) = (handle, value) {
        values[handle.index()] = Some(convert(value as f32));
    }
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
        let CompiledTimelineAction::Phaser { phaser } = &event.action else {
            continue;
        };
        if !event_is_active(event, time.beat) {
            continue;
        }

        let default_multiplier = show
            .phasers
            .get(phaser.as_str())
            .and_then(|compiled| compiled.multiplier)
            .unwrap_or(1.0);
        let target = CompiledAutomationTarget::EffectInstance {
            instance: phaser.clone(),
            parameter: CompiledEffectParameter::Multiplier,
        };
        active_phasers.push(ResolvedPhaser {
            instance: phaser.clone(),
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
    let mut resolved_parameters: HashMap<&CompiledAutomationTarget, (f64, usize, AnimatableValue)> =
        HashMap::new();
    for (index, event) in timeline.events.iter().enumerate() {
        let CompiledTimelineAction::Animate {
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
        let Some(value) = evaluate_animation_at(
            event,
            from,
            to,
            easing.as_ref().map(|value| value.as_str()),
            time.beat,
        ) else {
            continue;
        };

        let replace = resolved_parameters
            .get(target)
            .is_none_or(|(start, previous_index, _)| {
                event.beat > *start || (event.beat == *start && index > *previous_index)
            });
        if replace {
            resolved_parameters.insert(target, (event.beat, index, value));
        }
    }
    for (target, (_, _, value)) in resolved_parameters {
        parameters.write_value(target.clone(), value);
    }

    (active_phasers, parameters)
}

fn event_is_active(event: &CompiledTimelineEvent, beat: f64) -> bool {
    if beat < event.beat {
        return false;
    }
    event
        .duration
        .is_none_or(|duration| beat < event.beat + duration)
}

fn evaluate_animation_at(
    event: &CompiledTimelineEvent,
    from: &crate::document::AnimatableValueDSL,
    to: &crate::document::AnimatableValueDSL,
    easing: Option<&str>,
    beat: f64,
) -> Option<AnimatableValue> {
    let start = AnimatableValue::from_document(from)?;
    let end = AnimatableValue::from_document(to)?;
    let duration = event.duration.unwrap_or(0.0);
    if duration <= 0.0 || beat >= event.beat + duration {
        return Some(end);
    }

    let progress = ((beat - event.beat) / duration).clamp(0.0, 1.0);
    Some(start.lerp(&end, ease(progress, easing.unwrap_or("linear"))))
}

fn integrate_float_parameter(
    events: &[CompiledTimelineEvent],
    target: &CompiledAutomationTarget,
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
            CompiledTimelineAction::Animate {
                target: event_target,
                from,
                to,
                easing,
            } if event_target == target => Some((
                index,
                event,
                from,
                to,
                easing.as_ref().map(|value| value.as_str()),
            )),
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
    event: &CompiledTimelineEvent,
    from: &crate::document::AnimatableValueDSL,
    to: &crate::document::AnimatableValueDSL,
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
    use crate::compiler::{
        parser::ShowDSL, CompiledAutomationTarget, CompiledEffectParameter, Compiler,
    };
    use crate::engine::attribute::{resolve_attribute, FixtureFrame};
    use crate::engine::profile::{AttributeValue, COLOR_RGB_ATTRIBUTE, INTENSITY_ATTRIBUTE};

    fn compiled_show() -> crate::compiler::CompiledShow {
        let dsl: ShowDSL = serde_json::from_str(
            r##"{
                "schema_version": 2,
                "meta": { "name": "render at" },
                "patch": [{ "profile_id": "generic-rgb", "id_range": [1, 1] }],
                "layout": { "type": "generator", "generator": {
                    "shape": "matrix", "rows": 1, "columns": 1, "spacing": 1
                }},
                "groups": [{ "id": "all", "name": "All", "fixtures": [1] }],
                "phasers": [{
                    "id": "pulse", "name": "Pulse", "target": "all", "multiplier": 1,
                    "steps": [
                        { "values": { "color": "#ffffff", "dimmer": 1 }, "width": 50, "transition": 0 },
                        { "values": { "color": "#000000", "dimmer": 0 }, "width": 50, "transition": 0 }
                    ],
                    "phase": { "mode": "spread", "spread": { "from": 0, "to": 0 } }
                }],
                "timeline": { "events": [
                    { "beat": 0, "duration": 4, "action": { "type": "phaser", "phaser": "pulse" } },
                    { "beat": 0, "duration": 2, "action": {
                        "type": "animate", "target": {
                            "scope": "effect_instance", "instance_id": "pulse", "parameter_id": "multiplier"
                        },
                        "from": 1, "to": 3, "easing": "linear"
                    }},
                    { "beat": 0, "duration": 2, "action": {
                        "type": "animate", "target": {
                            "scope": "global", "parameter_id": "master_dimmer"
                        },
                        "from": 1, "to": 0.5, "easing": "linear"
                    }}
                ]}
            }"##,
        )
        .expect("test DSL");
        Compiler::compile_document(dsl).expect("compiled test show")
    }

    #[test]
    fn multiplier_automation_is_integrated_over_musical_time() {
        let show = compiled_show();
        let events = &show.timeline.as_ref().expect("timeline").events;
        let target = CompiledAutomationTarget::EffectInstance {
            instance: "pulse".to_string().into(),
            parameter: CompiledEffectParameter::Multiplier,
        };

        assert_eq!(
            integrate_float_parameter(events, &target, 0.0, 1.0, 1.0),
            1.5
        );
        assert_eq!(
            integrate_float_parameter(events, &target, 0.0, 2.0, 1.0),
            4.0
        );
        assert_eq!(
            integrate_float_parameter(events, &target, 0.0, 3.0, 1.0),
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
        assert_eq!(direct.len(), 1);
        assert_eq!(direct[0].id, 1);
        assert_eq!(
            attribute(&direct[0], COLOR_RGB_ATTRIBUTE),
            &AttributeValue::Color([255, 255, 255])
        );
        assert_eq!(
            attribute(&direct[0], INTENSITY_ATTRIBUTE),
            &AttributeValue::Scalar(0.6875)
        );
    }

    #[test]
    fn timeline_event_end_rebuilds_to_blackout() {
        let show = compiled_show();
        let frame = render_at(&show, RenderTime { beat: 4.0 }, RenderSource::Timeline);
        assert_eq!(frame.len(), 1);
        assert_eq!(
            attribute(&frame[0], COLOR_RGB_ATTRIBUTE),
            &AttributeValue::Color([0, 0, 0])
        );
        assert_eq!(
            attribute(&frame[0], INTENSITY_ATTRIBUTE),
            &AttributeValue::Scalar(0.0)
        );
    }

    #[test]
    fn moving_head_effects_render_profile_specific_angle_attributes() {
        let dsl: ShowDSL = serde_json::from_str(
            r##"{
                "schema_version": 2,
                "meta": { "name": "moving attributes" },
                "patch": [{ "profile_id": "generic-moving-head", "id_range": [1, 1] }],
                "layout": { "type": "generator", "generator": {
                    "shape": "matrix", "rows": 1, "columns": 1, "spacing": 1
                }},
                "groups": [{ "id": "all", "name": "All", "fixtures": [1] }],
                "phasers": [{
                    "id": "position", "name": "Position", "target": "all",
                    "steps": [{
                        "values": {
                            "color": "#ff0000", "dimmer": 0.8, "pan": 90, "tilt": -45
                        },
                        "width": 100, "transition": 0
                    }],
                    "phase": { "mode": "spread", "spread": { "from": 0, "to": 0 } }
                }],
                "timeline": { "events": [{
                    "beat": 0, "duration": 2,
                    "action": { "type": "phaser", "phaser": "position" }
                }]}
            }"##,
        )
        .expect("moving-head DSL");
        let show = Compiler::compile_document(dsl).expect("compiled moving-head show");
        let frame = render_at(&show, RenderTime { beat: 0.5 }, RenderSource::Timeline);

        assert_eq!(
            attribute(&frame[0], crate::engine::profile::PAN_ATTRIBUTE),
            &AttributeValue::Angle(90.0)
        );
        assert_eq!(
            attribute(&frame[0], crate::engine::profile::TILT_ATTRIBUTE),
            &AttributeValue::Angle(-45.0)
        );
    }

    #[test]
    fn overlapping_effects_use_htp_intensity_and_stable_ltp_color() {
        let dsl: ShowDSL = serde_json::from_str(
            r##"{
                "schema_version": 2,
                "meta": { "name": "mixed attributes" },
                "patch": [{ "profile_id": "generic-rgb", "id_range": [1, 1] }],
                "layout": { "type": "generator", "generator": {
                    "shape": "matrix", "rows": 1, "columns": 1, "spacing": 1
                }},
                "groups": [{ "id": "all", "name": "All", "fixtures": [1] }],
                "phasers": [
                    {
                        "id": "red", "name": "Red", "target": "all",
                        "steps": [{
                            "values": { "color": "#ff0000", "dimmer": 0.25 },
                            "width": 100, "transition": 0
                        }],
                        "phase": { "mode": "spread", "spread": { "from": 0, "to": 0 } }
                    },
                    {
                        "id": "blue", "name": "Blue", "target": "all",
                        "steps": [{
                            "values": { "color": "#0000ff", "dimmer": 0.8 },
                            "width": 100, "transition": 0
                        }],
                        "phase": { "mode": "spread", "spread": { "from": 0, "to": 0 } }
                    }
                ],
                "timeline": { "events": [
                    { "beat": 0, "duration": 2,
                      "action": { "type": "phaser", "phaser": "red" } },
                    { "beat": 0, "duration": 2,
                      "action": { "type": "phaser", "phaser": "blue" } }
                ]}
            }"##,
        )
        .expect("mixed DSL");
        let show = Compiler::compile_document(dsl).expect("compiled mixed show");

        for _ in 0..2 {
            let frame = render_at(&show, RenderTime { beat: 0.5 }, RenderSource::Timeline);
            assert_eq!(
                attribute(&frame[0], INTENSITY_ATTRIBUTE),
                &AttributeValue::Scalar(0.8)
            );
            assert_eq!(
                attribute(&frame[0], COLOR_RGB_ATTRIBUTE),
                &AttributeValue::Color([0, 0, 255])
            );
        }
    }

    fn attribute<'a>(frame: &'a FixtureFrame, id: &str) -> &'a AttributeValue {
        frame
            .value(resolve_attribute(frame.profile, id).expect("profile attribute"))
            .expect("frame attribute")
    }
}
