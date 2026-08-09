use super::animation::ParameterContext;
use super::attribute::{AttributeHandle, FixtureFrame};
use super::mixer::{mix_fixture, AttributeWrite};
use super::musical_time::MusicalTime;
use super::timeline::{active_clips_at, evaluate_lane_at, integrate_lane_scalar_ticks};
use crate::compiler::{CompiledAutomationTarget, CompiledShow, EffectInstanceHandle};
use crate::engine::effect::{
    common_parameter_handle, evaluate_effect_graph, Direction, EffectEvaluationParameters,
    ParameterValue, COLOR_PARAMETER_ID, DIRECTION_PARAMETER_ID, INTENSITY_PARAMETER_ID,
    PAN_PARAMETER_ID, PHASE_PARAMETER_ID, SPEED_PARAMETER_ID, TILT_PARAMETER_ID,
    TRANSITION_PARAMETER_ID, WIDTH_PARAMETER_ID,
};
use crate::engine::profile::{
    AttributeValue, COLOR_RGB_ATTRIBUTE, INTENSITY_ATTRIBUTE, PAN_ATTRIBUTE, TILT_ATTRIBUTE,
};
use rayon::prelude::*;
use serde::Serialize;

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
    pub source_id: String,
    pub instance: EffectInstanceHandle,
    pub phase: f64,
    pub layer: i32,
    pub weight: Option<f32>,
    pub activation_order: u64,
    pub stable_source_order: u32,
    pub targeting_tick: u64,
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
                .filter(|phaser| show.effect_instances.contains_key(&phaser.id))
                .enumerate()
                .map(|(index, phaser)| {
                    let ppq = show.timeline.as_ref().map_or(960, |timeline| timeline.ppq);
                    let targeting_tick =
                        ((time.beat - phaser.start_beat).max(0.0) * f64::from(ppq)).round() as u64;
                    let phase = show
                        .effect_instances
                        .get(&phaser.id)
                        .and_then(|instance| instance.targeting_scene.as_ref())
                        .and_then(|scene| scene.phase_reset_start_tick(targeting_tick))
                        .map_or_else(
                            || phaser.phase_at(time),
                            |phase_start_tick| {
                                phaser.phase_offset
                                    + targeting_tick.saturating_sub(phase_start_tick) as f64
                                        / f64::from(ppq)
                                        * phaser.multiplier
                            },
                        );
                    ResolvedPhaser {
                        source_id: phaser.id.clone(),
                        instance: phaser.id.clone().into(),
                        phase,
                        layer: 0,
                        weight: None,
                        activation_order: index as u64,
                        stable_source_order: u32::try_from(index).unwrap_or(u32::MAX),
                        targeting_tick,
                    }
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
        .enumerate()
        .map(|(fixture_index, fixture)| {
            let output = FixtureFrame::with_profile_defaults(fixture.id, fixture.profile);
            let mut writes = Vec::new();

            for active in active_phasers {
                let Some(instance) = show.effect_instances.get(active.instance.as_str()) else {
                    continue;
                };
                let Some(definition) = show.effect_definitions.get(instance.definition.index())
                else {
                    continue;
                };
                let Some(group) = show.groups.get(&instance.target_group_id) else {
                    continue;
                };
                if !group.contains_fixture_index(fixture_index) {
                    continue;
                }
                let targeting_weight = instance.targeting_scene.as_ref().map_or(1.0, |scene| {
                    scene.weight_at(active.targeting_tick, fixture_index)
                });
                if targeting_weight <= f32::EPSILON {
                    continue;
                }
                let phase_offset = resolve_effect_scalar(
                    definition,
                    instance,
                    &active.instance,
                    parameters,
                    PHASE_PARAMETER_ID,
                    0.0,
                ) + instance.phase_offset;
                let direction = definition
                    .parameter_handle(DIRECTION_PARAMETER_ID)
                    .and_then(|handle| {
                        parameters
                            .get_effect_direction(&active.instance, handle)
                            .map(|direction| match direction {
                                crate::document::DirectionDSL::Forward => Direction::Forward,
                                crate::document::DirectionDSL::Reverse => Direction::Reverse,
                            })
                            .or_else(|| {
                                instance
                                    .resolve_parameter(definition, handle)
                                    .and_then(|value| match value {
                                        ParameterValue::Direction(direction) => Some(*direction),
                                        _ => None,
                                    })
                            })
                    })
                    .unwrap_or(Direction::Forward);
                let phase = match direction {
                    Direction::Forward => active.phase + phase_offset,
                    Direction::Reverse => phase_offset - active.phase,
                };
                let mut values = vec![
                    None;
                    crate::engine::profile::profile_by_handle(fixture.profile)
                        .attributes
                        .len()
                ];
                for (handle, value) in evaluate_effect_graph(
                    definition,
                    instance,
                    fixture.id,
                    fixture_index,
                    fixture.profile,
                    phase,
                    EffectEvaluationParameters {
                        width_percent: resolve_effect_scalar(
                            definition,
                            instance,
                            &active.instance,
                            parameters,
                            WIDTH_PARAMETER_ID,
                            100.0,
                        ),
                        transition_percent: resolve_effect_scalar(
                            definition,
                            instance,
                            &active.instance,
                            parameters,
                            TRANSITION_PARAMETER_ID,
                            100.0,
                        ),
                    },
                ) {
                    values[handle.index()] = Some(value);
                }

                let color_handle =
                    super::attribute::resolve_attribute(fixture.profile, COLOR_RGB_ATTRIBUTE);
                let graph_writes_color = color_handle.is_some_and(|handle| {
                    effect_graph_writes_attribute(definition, fixture.profile, handle)
                });
                if let (Some(handle), Some((red, green, blue))) = (
                    color_handle,
                    resolve_effect_color(
                        definition,
                        instance,
                        &active.instance,
                        parameters,
                        !graph_writes_color,
                    ),
                ) {
                    values[handle.index()] = Some(AttributeValue::Color([red, green, blue]));
                }
                let intensity_handle =
                    super::attribute::resolve_attribute(fixture.profile, INTENSITY_ATTRIBUTE);
                apply_intensity_control(
                    &mut values,
                    intensity_handle,
                    resolve_effect_scalar(
                        definition,
                        instance,
                        &active.instance,
                        parameters,
                        INTENSITY_PARAMETER_ID,
                        1.0,
                    ),
                    resolve_effect_scalar_override(
                        definition,
                        instance,
                        &active.instance,
                        parameters,
                        INTENSITY_PARAMETER_ID,
                    ),
                    intensity_handle.is_some_and(|handle| {
                        effect_graph_writes_attribute(definition, fixture.profile, handle)
                    }),
                );
                apply_scalar_override(
                    &mut values,
                    super::attribute::resolve_attribute(fixture.profile, PAN_ATTRIBUTE),
                    resolve_effect_scalar_override(
                        definition,
                        instance,
                        &active.instance,
                        parameters,
                        PAN_PARAMETER_ID,
                    ),
                    AttributeValue::Angle,
                );
                apply_scalar_override(
                    &mut values,
                    super::attribute::resolve_attribute(fixture.profile, TILT_ATTRIBUTE),
                    resolve_effect_scalar_override(
                        definition,
                        instance,
                        &active.instance,
                        parameters,
                        TILT_PARAMETER_ID,
                    ),
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
                        source_id: &active.source_id,
                        layer: active.layer,
                        priority: instance.priority,
                        activation_order: active.activation_order,
                        stable_source_order: active.stable_source_order,
                        weight: Some(
                            active.weight.unwrap_or(1.0)
                                * group.weight_at(fixture_index)
                                * targeting_weight,
                        ),
                        policy_override: instance.mix_policy_override(fixture.profile, handle),
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

fn resolve_effect_scalar(
    definition: &crate::engine::effect::EffectDefinition,
    instance: &crate::engine::effect::EffectInstance,
    instance_handle: &EffectInstanceHandle,
    parameters: &ParameterContext,
    parameter_id: &str,
    fallback: f64,
) -> f64 {
    let Some(handle) = definition.parameter_handle(parameter_id) else {
        return fallback;
    };
    parameters
        .get_effect_float(instance_handle, handle)
        .or_else(|| instance.resolve_parameter(definition, handle)?.as_scalar())
        .unwrap_or(fallback)
}

fn resolve_effect_scalar_override(
    definition: &crate::engine::effect::EffectDefinition,
    instance: &crate::engine::effect::EffectInstance,
    instance_handle: &EffectInstanceHandle,
    parameters: &ParameterContext,
    parameter_id: &str,
) -> Option<f64> {
    let handle = definition.parameter_handle(parameter_id)?;
    parameters
        .get_effect_float(instance_handle, handle)
        .or_else(|| {
            instance
                .parameter_overrides
                .get(&handle)
                .and_then(ParameterValue::as_scalar)
        })
}

fn resolve_effect_color(
    definition: &crate::engine::effect::EffectDefinition,
    instance: &crate::engine::effect::EffectInstance,
    instance_handle: &EffectInstanceHandle,
    parameters: &ParameterContext,
    legacy_default_enabled: bool,
) -> Option<(u8, u8, u8)> {
    let handle = definition.parameter_handle(COLOR_PARAMETER_ID)?;
    parameters
        .get_effect_color(instance_handle, handle)
        .or_else(|| match instance.parameter_overrides.get(&handle)? {
            ParameterValue::Color(color) => Some((color[0], color[1], color[2])),
            _ => None,
        })
        .or_else(|| {
            if !definition
                .parameter(handle)?
                .default_enabled
                .unwrap_or(legacy_default_enabled)
            {
                return None;
            }
            match instance.resolve_parameter(definition, handle)? {
                ParameterValue::Color(color) => Some((color[0], color[1], color[2])),
                _ => None,
            }
        })
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

fn apply_intensity_control(
    values: &mut [Option<AttributeValue>],
    handle: Option<AttributeHandle>,
    scale: f64,
    explicit_override: Option<f64>,
    graph_writes_intensity: bool,
) {
    let Some(handle) = handle else {
        return;
    };
    match values.get_mut(handle.index()) {
        Some(Some(AttributeValue::Scalar(value))) => *value *= scale as f32,
        Some(slot @ None) if !graph_writes_intensity => {
            if let Some(value) = explicit_override {
                *slot = Some(AttributeValue::Scalar(value as f32));
            }
        }
        _ => {}
    }
}

fn effect_graph_writes_attribute(
    definition: &crate::engine::effect::EffectDefinition,
    profile: crate::engine::profile::FixtureProfileHandle,
    attribute: AttributeHandle,
) -> bool {
    definition.graph.writers.iter().any(|writer| {
        let Some(crate::engine::effect::CompiledEffectNode::AttributeWriter {
            input,
            attributes,
            ..
        }) = definition.graph.nodes.get(writer.index())
        else {
            return false;
        };
        if attributes.get(&profile).copied().flatten() == Some(attribute) {
            return true;
        }
        let Some(crate::engine::effect::CompiledEffectNode::StepSequence { profiles, .. }) =
            definition.graph.nodes.get(input.index())
        else {
            return false;
        };
        profiles.get(&profile).is_some_and(|sequence| {
            sequence.steps.iter().any(|step| {
                step.values
                    .get(attribute.index())
                    .is_some_and(Option::is_some)
            })
        })
    })
}

fn resolve_timeline_at(
    show: &CompiledShow,
    time: RenderTime,
) -> (Vec<ResolvedPhaser>, ParameterContext) {
    let Some(timeline) = &show.timeline else {
        return (Vec::new(), ParameterContext::new());
    };

    let target_time = MusicalTime::from_beats(time.beat, timeline.ppq)
        .unwrap_or(MusicalTime::from_ticks(u64::MAX));
    let mut active_phasers = Vec::new();
    for track in &timeline.tracks {
        for active in active_clips_at(track, target_time) {
            let clip = active.clip;
            let instance = show.effect_instances.get(clip.instance.as_str());
            let default_speed = instance
                .and_then(|instance| {
                    let definition = show.effect_definitions.get(instance.definition.index())?;
                    let handle = definition.parameter_handle(SPEED_PARAMETER_ID)?;
                    instance
                        .resolve_parameter(definition, handle)
                        .and_then(|value| value.as_scalar())
                })
                .unwrap_or(1.0);
            let speed_target = CompiledAutomationTarget::EffectInstance {
                instance: clip.instance.clone(),
                parameter: common_parameter_handle(SPEED_PARAMETER_ID)
                    .expect("common speed parameter"),
            };
            let speed_lane = timeline
                .automation_index
                .get(&speed_target)
                .and_then(|index| timeline.automation_lanes.get(*index));
            let targeting_tick = target_time.ticks().saturating_sub(clip.start.ticks());
            let phase_start = instance
                .and_then(|instance| instance.targeting_scene.as_ref())
                .and_then(|scene| scene.phase_reset_start_tick(targeting_tick))
                .map(|phase_start_tick| {
                    clip.start
                        .checked_add(phase_start_tick)
                        .unwrap_or(target_time)
                })
                .unwrap_or(clip.start);
            let phase_ticks =
                integrate_lane_scalar_ticks(speed_lane, phase_start, target_time, default_speed);
            let phase_offset = if phase_start == clip.start {
                clip.source_offset_ticks as f64 / f64::from(timeline.ppq)
            } else {
                0.0
            };
            active_phasers.push(ResolvedPhaser {
                source_id: clip.id.clone(),
                instance: clip.instance.clone(),
                phase: phase_offset + phase_ticks / f64::from(timeline.ppq),
                layer: clip.layer,
                weight: active.weight,
                activation_order: clip.start.ticks(),
                stable_source_order: clip.stable_order,
                targeting_tick,
            });
        }
    }

    let mut parameters = ParameterContext::new();
    for lane in &timeline.automation_lanes {
        if let Some(value) = evaluate_lane_at(lane, target_time) {
            parameters.write_value(lane.target.clone(), value);
        }
    }

    (active_phasers, parameters)
}

#[cfg(test)]
mod tests {
    use super::{render_at, RenderSource, RenderTime};
    use crate::compiler::{CompiledAutomationTarget, Compiler};
    use crate::engine::attribute::{resolve_attribute, FixtureFrame};
    use crate::engine::effect::{common_parameter_handle, SPEED_PARAMETER_ID};
    use crate::engine::musical_time::MusicalTime;
    use crate::engine::profile::{AttributeValue, COLOR_RGB_ATTRIBUTE, INTENSITY_ATTRIBUTE};
    use crate::engine::timeline::integrate_lane_scalar_ticks;

    fn compiled_show() -> crate::compiler::CompiledShow {
        let dsl = crate::document::load_document(
            r##"{
                "schema_version": 1,
                "meta": { "name": "render at" },
                "patch": [{ "profile_id": "generic-rgb", "id_range": [1, 1] }],
                "layout": { "type": "generator", "generator": {
                    "shape": "matrix", "rows": 1, "columns": 1, "spacing": 1
                }},
                "groups": [{ "id": "all", "name": "All", "fixtures": [1] }],
                "effect_definitions": [{
                    "id": "project.pulse", "name": "Pulse", "revision": 1, "source": "project_local",
                    "parameters": [{
                        "id": "speed", "name": "Speed", "value_type": "scalar",
                        "default_value": { "type": "scalar", "value": 1.0 }, "range": [0.25, 8.0],
                        "unit": "multiplier", "ui_hint": "slider", "automation": "continuous"
                    }],
                    "graph": { "nodes": [
                        { "type": "time", "id": "time" },
                        { "type": "step_sequence", "id": "sequence", "phase": { "node_id": "time", "port": "scalar" }, "steps": [
                            { "values": { "color": "#ffffff", "dimmer": 1 }, "width": 50, "transition": 0 },
                            { "values": { "color": "#000000", "dimmer": 0 }, "width": 50, "transition": 0 }
                        ]},
                        { "type": "attribute_writer", "id": "output", "input": { "node_id": "sequence", "port": "attribute_set" } }
                    ]},
                    "catalog": { "energy": 0.5, "density": 0.5, "motion": "pulse", "colorfulness": 0.5, "strobe_risk": "none", "required_attributes": ["intensity", "color.rgb"] }
                }],
                "effect_instances": [{
                    "id": "pulse", "definition_id": "project.pulse", "definition_revision": 1,
                    "target_group_id": "all", "seed": "0000000000000001"
                }],
                "timeline": {
                    "ppq": 960,
                    "tempo_map": { "points": [{ "time_tick": 0, "bpm": 128 }] },
                    "tracks": [{
                        "id": "effects", "name": "Effects", "overlap_policy": "layer",
                        "clips": [{ "id": "pulse-clip", "instance_id": "pulse", "start_tick": 0, "duration_tick": 3840 }],
                        "automation_lanes": [
                            {
                                "id": "pulse-speed",
                                "target": { "scope": "effect_instance", "instance_id": "pulse", "parameter_id": "speed" },
                                "keyframes": [
                                    { "id": "speed-0", "time_tick": 0, "value": { "type": "scalar", "value": 1 }, "interpolation": "linear" },
                                    { "id": "speed-1", "time_tick": 1920, "value": { "type": "scalar", "value": 3 }, "interpolation": "hold" }
                                ]
                            },
                            {
                                "id": "master-dimmer",
                                "target": { "scope": "global", "parameter_id": "master_dimmer" },
                                "keyframes": [
                                    { "id": "master-0", "time_tick": 0, "value": { "type": "scalar", "value": 1 }, "interpolation": "linear" },
                                    { "id": "master-1", "time_tick": 1920, "value": { "type": "scalar", "value": 0.5 }, "interpolation": "hold" }
                                ]
                            }
                        ]
                    }]
                }
            }"##,
        )
        .expect("test DSL")
        .document;
        Compiler::compile_document(dsl).expect("compiled test show")
    }

    #[test]
    fn multiplier_automation_is_integrated_over_musical_time() {
        let show = compiled_show();
        let timeline = show.timeline.as_ref().expect("timeline");
        let target = CompiledAutomationTarget::EffectInstance {
            instance: "pulse".to_string().into(),
            parameter: common_parameter_handle(SPEED_PARAMETER_ID).expect("speed parameter"),
        };
        let lane = timeline
            .automation_index
            .get(&target)
            .and_then(|index| timeline.automation_lanes.get(*index));

        assert_eq!(
            integrate_lane_scalar_ticks(lane, MusicalTime::ZERO, MusicalTime::from_ticks(960), 1.0,)
                / f64::from(timeline.ppq),
            1.5
        );
        assert_eq!(
            integrate_lane_scalar_ticks(
                lane,
                MusicalTime::ZERO,
                MusicalTime::from_ticks(1_920),
                1.0,
            ) / f64::from(timeline.ppq),
            4.0
        );
        assert_eq!(
            integrate_lane_scalar_ticks(
                lane,
                MusicalTime::ZERO,
                MusicalTime::from_ticks(2_880),
                1.0,
            ) / f64::from(timeline.ppq),
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
    fn one_hundred_random_seeks_match_sequential_tick_rendering() {
        let show = compiled_show();
        let mut state = 0x9e37_79b9_7f4a_7c15_u64;
        let targets: Vec<_> = (0..100)
            .map(|_| {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                state % 3_840
            })
            .collect();
        let mut sequential_ticks = targets.clone();
        sequential_ticks.sort_unstable();
        sequential_ticks.dedup();
        let sequential_frames: Vec<_> = sequential_ticks
            .iter()
            .map(|tick| {
                (
                    *tick,
                    render_at(
                        &show,
                        RenderTime {
                            beat: *tick as f64 / 960.0,
                        },
                        RenderSource::Timeline,
                    ),
                )
            })
            .collect();

        for tick in targets {
            let direct = render_at(
                &show,
                RenderTime {
                    beat: tick as f64 / 960.0,
                },
                RenderSource::Timeline,
            );
            let sequential = sequential_frames
                .iter()
                .find(|(candidate, _)| *candidate == tick)
                .map(|(_, frame)| frame)
                .expect("sequential frame");
            assert_eq!(&direct, sequential, "seek mismatch at tick {tick}");
        }
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
        let dsl = crate::document::load_document(
            r##"{
                "schema_version": 1,
                "meta": { "name": "moving attributes" },
                "patch": [{ "profile_id": "generic-moving-head", "id_range": [1, 1] }],
                "layout": { "type": "generator", "generator": {
                    "shape": "matrix", "rows": 1, "columns": 1, "spacing": 1
                }},
                "groups": [{ "id": "all", "name": "All", "fixtures": [1] }],
                "effect_definitions": [{
                    "id": "project.position", "name": "Position", "revision": 1, "source": "project_local",
                    "parameters": [],
                    "graph": { "nodes": [
                        { "type": "time", "id": "time" },
                        { "type": "step_sequence", "id": "sequence", "phase": { "node_id": "time", "port": "scalar" }, "steps": [{
                            "values": { "color": "#ff0000", "dimmer": 0.8, "pan": 90, "tilt": -45 },
                            "width": 100, "transition": 0
                        }]},
                        { "type": "attribute_writer", "id": "output", "input": { "node_id": "sequence", "port": "attribute_set" } }
                    ]},
                    "catalog": { "energy": 0.5, "density": 0.5, "motion": "sweep", "colorfulness": 0.5, "strobe_risk": "none", "required_attributes": ["intensity", "color.rgb", "position.pan", "position.tilt"] }
                }],
                "effect_instances": [{ "id": "position", "definition_id": "project.position", "definition_revision": 1, "target_group_id": "all", "seed": "0000000000000001" }],
                "timeline": {
                    "ppq": 960,
                    "tempo_map": { "points": [{ "time_tick": 0, "bpm": 128 }] },
                    "tracks": [{ "id": "effects", "name": "Effects", "overlap_policy": "layer", "clips": [
                        { "id": "position-clip", "instance_id": "position", "start_tick": 0, "duration_tick": 1920 }
                    ]}]
                }
            }"##,
        )
        .expect("moving-head DSL")
        .document;
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
        let dsl = crate::document::load_document(
            r##"{
                "schema_version": 1,
                "meta": { "name": "mixed attributes" },
                "patch": [{ "profile_id": "generic-rgb", "id_range": [1, 1] }],
                "layout": { "type": "generator", "generator": {
                    "shape": "matrix", "rows": 1, "columns": 1, "spacing": 1
                }},
                "groups": [{ "id": "all", "name": "All", "fixtures": [1] }],
                "effect_definitions": [
                    {
                        "id": "project.red", "name": "Red", "revision": 1, "source": "project_local", "parameters": [],
                        "graph": { "nodes": [
                            { "type": "time", "id": "time" },
                            { "type": "step_sequence", "id": "sequence", "phase": { "node_id": "time", "port": "scalar" }, "steps": [{ "values": { "color": "#ff0000", "dimmer": 0.25 }, "width": 100, "transition": 0 }]},
                            { "type": "attribute_writer", "id": "output", "input": { "node_id": "sequence", "port": "attribute_set" } }
                        ]},
                        "catalog": { "energy": 0.25, "density": 0.5, "motion": "static", "colorfulness": 1.0, "strobe_risk": "none", "required_attributes": ["intensity", "color.rgb"] }
                    },
                    {
                        "id": "project.blue", "name": "Blue", "revision": 1, "source": "project_local", "parameters": [],
                        "graph": { "nodes": [
                            { "type": "time", "id": "time" },
                            { "type": "step_sequence", "id": "sequence", "phase": { "node_id": "time", "port": "scalar" }, "steps": [{ "values": { "color": "#0000ff", "dimmer": 0.8 }, "width": 100, "transition": 0 }]},
                            { "type": "attribute_writer", "id": "output", "input": { "node_id": "sequence", "port": "attribute_set" } }
                        ]},
                        "catalog": { "energy": 0.8, "density": 0.5, "motion": "static", "colorfulness": 1.0, "strobe_risk": "none", "required_attributes": ["intensity", "color.rgb"] }
                    }
                ],
                "effect_instances": [
                    { "id": "red", "definition_id": "project.red", "definition_revision": 1, "target_group_id": "all", "seed": "0000000000000001" },
                    { "id": "blue", "definition_id": "project.blue", "definition_revision": 1, "target_group_id": "all", "seed": "0000000000000002" }
                ],
                "timeline": {
                    "ppq": 960,
                    "tempo_map": { "points": [{ "time_tick": 0, "bpm": 128 }] },
                    "tracks": [{ "id": "effects", "name": "Effects", "overlap_policy": "layer", "clips": [
                        { "id": "red-clip", "instance_id": "red", "start_tick": 0, "duration_tick": 1920, "layer": 0 },
                        { "id": "blue-clip", "instance_id": "blue", "start_tick": 0, "duration_tick": 1920, "layer": 1 }
                    ]}]
                }
            }"##,
        )
        .expect("mixed DSL")
        .document;
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
