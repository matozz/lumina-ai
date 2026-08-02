use crate::compiler::{
    CompiledAutomationLane, CompiledEffectClip, CompiledKeyframe, CompiledTimelineTrack,
};
use crate::document::{KeyframeInterpolationDSL, OverlapPolicyDSL};
use crate::engine::animation::{ease, AnimatableValue};
use crate::engine::musical_time::MusicalTime;

#[derive(Clone, Copy, Debug)]
pub struct ActiveClip<'a> {
    pub clip: &'a CompiledEffectClip,
    pub weight: Option<f32>,
}

pub fn active_clips_at(track: &CompiledTimelineTrack, time: MusicalTime) -> Vec<ActiveClip<'_>> {
    let mut index = track.clips.partition_point(|clip| clip.start <= time);
    let mut active = Vec::new();
    while index > 0 {
        if track.prefix_max_end[index - 1] <= time.ticks() {
            break;
        }
        index -= 1;
        let clip = &track.clips[index];
        if time < clip.end() {
            active.push(ActiveClip { clip, weight: None });
        }
    }
    active.sort_by_key(|active| {
        (
            active.clip.layer,
            active.clip.start,
            active.clip.stable_order,
        )
    });

    match track.overlap_policy {
        OverlapPolicyDSL::Layer | OverlapPolicyDSL::Reject => active,
        OverlapPolicyDSL::Replace => active.into_iter().rev().take(1).collect(),
        OverlapPolicyDSL::Crossfade if active.len() < 2 => active,
        OverlapPolicyDSL::Crossfade => {
            let incoming = active.pop().expect("at least two active clips");
            let outgoing = active.pop().expect("at least two active clips");
            let overlap_start = outgoing.clip.start.max(incoming.clip.start).ticks();
            let overlap_end = outgoing.clip.end().min(incoming.clip.end()).ticks();
            let progress = if overlap_end <= overlap_start {
                1.0
            } else {
                (time.ticks().saturating_sub(overlap_start) as f64
                    / (overlap_end - overlap_start) as f64)
                    .clamp(0.0, 1.0)
            };
            vec![
                ActiveClip {
                    clip: outgoing.clip,
                    weight: Some((1.0 - progress) as f32),
                },
                ActiveClip {
                    clip: incoming.clip,
                    weight: Some(progress as f32),
                },
            ]
        }
    }
}

pub fn evaluate_lane_at(
    lane: &CompiledAutomationLane,
    time: MusicalTime,
) -> Option<AnimatableValue> {
    let upper = lane
        .keyframes
        .partition_point(|keyframe| keyframe.time <= time);
    if upper == 0 {
        return None;
    }
    let left = &lane.keyframes[upper - 1];
    if left.time == time || upper == lane.keyframes.len() {
        return Some(left.value.clone());
    }
    let right = &lane.keyframes[upper];
    Some(interpolate_keyframes(left, right, time))
}

pub fn integrate_lane_scalar_ticks(
    lane: Option<&CompiledAutomationLane>,
    from: MusicalTime,
    to: MusicalTime,
    default_value: f64,
) -> f64 {
    if to <= from {
        return 0.0;
    }
    let Some(lane) = lane else {
        return default_value * (to.ticks() - from.ticks()) as f64;
    };
    let mut boundaries = vec![from.ticks(), to.ticks()];
    boundaries.extend(
        lane.keyframes
            .iter()
            .map(|keyframe| keyframe.time.ticks())
            .filter(|tick| *tick > from.ticks() && *tick < to.ticks()),
    );
    boundaries.sort_unstable();
    boundaries.dedup();

    boundaries
        .windows(2)
        .map(|window| {
            let start = window[0];
            let end = window[1];
            let upper = lane
                .keyframes
                .partition_point(|keyframe| keyframe.time.ticks() <= start);
            if upper == 0 {
                return default_value * (end - start) as f64;
            }
            let left = &lane.keyframes[upper - 1];
            let Some(left_value) = scalar_value(&left.value) else {
                return default_value * (end - start) as f64;
            };
            if upper == lane.keyframes.len() {
                return left_value * (end - start) as f64;
            }
            let right = &lane.keyframes[upper];
            integrate_keyframe_segment(left, right, start, end)
                .unwrap_or(default_value * (end - start) as f64)
        })
        .sum()
}

fn interpolate_keyframes(
    left: &CompiledKeyframe,
    right: &CompiledKeyframe,
    time: MusicalTime,
) -> AnimatableValue {
    if matches!(left.interpolation, KeyframeInterpolationDSL::Hold) {
        return left.value.clone();
    }
    let duration = right.time.ticks() - left.time.ticks();
    let progress = (time.ticks() - left.time.ticks()) as f64 / duration as f64;
    if matches!(left.interpolation, KeyframeInterpolationDSL::Bezier) {
        if let (Some(start), Some(end)) = (scalar_value(&left.value), scalar_value(&right.value)) {
            return AnimatableValue::Float(hermite_value(left, right, start, end, progress));
        }
    }
    left.value
        .lerp(&right.value, eased_progress(progress, left.interpolation))
}

fn integrate_keyframe_segment(
    left: &CompiledKeyframe,
    right: &CompiledKeyframe,
    start_tick: u64,
    end_tick: u64,
) -> Option<f64> {
    let start_value = scalar_value(&left.value)?;
    let end_value = scalar_value(&right.value)?;
    let duration = (right.time.ticks() - left.time.ticks()) as f64;
    let normalized_start = (start_tick - left.time.ticks()) as f64 / duration;
    let normalized_end = (end_tick - left.time.ticks()) as f64 / duration;
    if matches!(left.interpolation, KeyframeInterpolationDSL::Hold) {
        return Some(start_value * (end_tick - start_tick) as f64);
    }
    if matches!(left.interpolation, KeyframeInterpolationDSL::Bezier) {
        return Some(
            duration
                * (hermite_antiderivative(left, right, start_value, end_value, normalized_end)
                    - hermite_antiderivative(
                        left,
                        right,
                        start_value,
                        end_value,
                        normalized_start,
                    )),
        );
    }
    let delta = end_value - start_value;
    Some(
        start_value * (end_tick - start_tick) as f64
            + delta
                * duration
                * (easing_antiderivative(normalized_end, left.interpolation)
                    - easing_antiderivative(normalized_start, left.interpolation)),
    )
}

fn eased_progress(progress: f64, interpolation: KeyframeInterpolationDSL) -> f64 {
    let name = match interpolation {
        KeyframeInterpolationDSL::Hold => return 0.0,
        KeyframeInterpolationDSL::Linear => "linear",
        KeyframeInterpolationDSL::EaseIn => "ease_in",
        KeyframeInterpolationDSL::EaseOut => "ease_out",
        KeyframeInterpolationDSL::EaseInOut | KeyframeInterpolationDSL::Bezier => "ease_in_out",
    };
    ease(progress, name)
}

fn easing_antiderivative(value: f64, interpolation: KeyframeInterpolationDSL) -> f64 {
    let value = value.clamp(0.0, 1.0);
    match interpolation {
        KeyframeInterpolationDSL::EaseIn => value.powi(3) / 3.0,
        KeyframeInterpolationDSL::EaseOut => value.powi(2) - value.powi(3) / 3.0,
        KeyframeInterpolationDSL::EaseInOut if value < 0.5 => 2.0 * value.powi(3) / 3.0,
        KeyframeInterpolationDSL::EaseInOut => {
            -value + 2.0 * value.powi(2) - 2.0 * value.powi(3) / 3.0 + 1.0 / 6.0
        }
        KeyframeInterpolationDSL::Hold => value,
        KeyframeInterpolationDSL::Linear | KeyframeInterpolationDSL::Bezier => value.powi(2) / 2.0,
    }
}

fn hermite_value(
    left: &CompiledKeyframe,
    right: &CompiledKeyframe,
    start: f64,
    end: f64,
    progress: f64,
) -> f64 {
    let progress = progress.clamp(0.0, 1.0);
    let duration = (right.time.ticks() - left.time.ticks()) as f64;
    let start_tangent = tangent_slope(left.out_tangent) * duration;
    let end_tangent = tangent_slope(right.in_tangent) * duration;
    let squared = progress * progress;
    let cubed = squared * progress;
    (2.0 * cubed - 3.0 * squared + 1.0) * start
        + (cubed - 2.0 * squared + progress) * start_tangent
        + (-2.0 * cubed + 3.0 * squared) * end
        + (cubed - squared) * end_tangent
}

fn hermite_antiderivative(
    left: &CompiledKeyframe,
    right: &CompiledKeyframe,
    start: f64,
    end: f64,
    progress: f64,
) -> f64 {
    let progress = progress.clamp(0.0, 1.0);
    let duration = (right.time.ticks() - left.time.ticks()) as f64;
    let start_tangent = tangent_slope(left.out_tangent) * duration;
    let end_tangent = tangent_slope(right.in_tangent) * duration;
    let squared = progress.powi(2);
    let cubed = progress.powi(3);
    let fourth = progress.powi(4);
    (0.5 * fourth - cubed + progress) * start
        + (0.25 * fourth - 2.0 * cubed / 3.0 + 0.5 * squared) * start_tangent
        + (-0.5 * fourth + cubed) * end
        + (0.25 * fourth - cubed / 3.0) * end_tangent
}

fn tangent_slope(tangent: Option<crate::compiler::CompiledKeyframeTangent>) -> f64 {
    tangent.map_or(0.0, |tangent| {
        if tangent.time.abs() <= f64::EPSILON {
            0.0
        } else {
            tangent.value / tangent.time
        }
    })
}

fn scalar_value(value: &AnimatableValue) -> Option<f64> {
    match value {
        AnimatableValue::Float(value) => Some(*value),
        AnimatableValue::Color(_, _, _) | AnimatableValue::Direction(_) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{active_clips_at, evaluate_lane_at, integrate_lane_scalar_ticks};
    use crate::compiler::{
        CompiledAutomationLane, CompiledAutomationTarget, CompiledEffectClip, CompiledKeyframe,
        CompiledKeyframeTangent, CompiledTimelineTrack,
    };
    use crate::document::{
        ClipPlaybackDSL, DirectionDSL, KeyframeInterpolationDSL, OverlapPolicyDSL,
    };
    use crate::engine::animation::AnimatableValue;
    use crate::engine::color::lerp_color_lab;
    use crate::engine::musical_time::MusicalTime;

    fn clip(id: &str, start: u64, duration: u64, layer: i32, order: u32) -> CompiledEffectClip {
        CompiledEffectClip {
            id: id.to_string(),
            instance: id.to_string().into(),
            start: MusicalTime::from_ticks(start),
            duration_ticks: duration,
            source_offset_ticks: 0,
            playback: ClipPlaybackDSL::Once,
            layer,
            stable_order: order,
        }
    }

    fn track(policy: OverlapPolicyDSL) -> CompiledTimelineTrack {
        CompiledTimelineTrack {
            id: "effects".to_string(),
            overlap_policy: policy,
            clips: vec![clip("long", 0, 100, 0, 0), clip("top", 20, 20, 1, 1)],
            prefix_max_end: vec![100, 100],
        }
    }

    fn keyframe(id: &str, time: u64, value: f64) -> CompiledKeyframe {
        CompiledKeyframe {
            id: id.to_string(),
            time: MusicalTime::from_ticks(time),
            value: AnimatableValue::Float(value),
            interpolation: KeyframeInterpolationDSL::Linear,
            in_tangent: None,
            out_tangent: None,
        }
    }

    fn lane() -> CompiledAutomationLane {
        CompiledAutomationLane {
            id: "master".to_string(),
            target: CompiledAutomationTarget::GlobalMasterDimmer,
            keyframes: vec![
                keyframe("zero", 10, 0.0),
                keyframe("half", 20, 0.5),
                keyframe("one", 30, 1.0),
            ],
            stable_order: 0,
        }
    }

    #[test]
    fn indexed_query_uses_half_open_boundaries_and_explicit_policies() {
        assert!(active_clips_at(&track(OverlapPolicyDSL::Layer), MusicalTime::ZERO).len() == 1);
        assert_eq!(
            active_clips_at(&track(OverlapPolicyDSL::Layer), MusicalTime::from_ticks(20)).len(),
            2
        );
        assert_eq!(
            active_clips_at(
                &track(OverlapPolicyDSL::Replace),
                MusicalTime::from_ticks(20)
            )[0]
            .clip
            .id,
            "top"
        );
        let crossfade_track = track(OverlapPolicyDSL::Crossfade);
        let crossfade = active_clips_at(&crossfade_track, MusicalTime::from_ticks(30));
        assert_eq!(crossfade.len(), 2);
        assert_eq!(crossfade[0].weight, Some(0.5));
        assert_eq!(crossfade[1].weight, Some(0.5));
        assert!(active_clips_at(
            &track(OverlapPolicyDSL::Layer),
            MusicalTime::from_ticks(100)
        )
        .is_empty());
    }

    #[test]
    fn multi_keyframe_lane_is_pure_and_holds_the_terminal_value() {
        let lane = lane();
        assert_eq!(evaluate_lane_at(&lane, MusicalTime::from_ticks(5)), None);
        assert_eq!(
            evaluate_lane_at(&lane, MusicalTime::from_ticks(15)),
            Some(AnimatableValue::Float(0.25))
        );
        assert_eq!(
            evaluate_lane_at(&lane, MusicalTime::from_ticks(30)),
            Some(AnimatableValue::Float(1.0))
        );
        assert_eq!(
            evaluate_lane_at(&lane, MusicalTime::from_ticks(300)),
            Some(AnimatableValue::Float(1.0))
        );
        assert_eq!(
            integrate_lane_scalar_ticks(
                Some(&lane),
                MusicalTime::ZERO,
                MusicalTime::from_ticks(40),
                1.0,
            ),
            30.0
        );
    }

    #[test]
    fn direction_lane_uses_discrete_hold_values() {
        let mut lane = lane();
        lane.keyframes = vec![
            CompiledKeyframe {
                id: "forward".to_string(),
                time: MusicalTime::ZERO,
                value: AnimatableValue::Direction(DirectionDSL::Forward),
                interpolation: KeyframeInterpolationDSL::Hold,
                in_tangent: None,
                out_tangent: None,
            },
            CompiledKeyframe {
                id: "reverse".to_string(),
                time: MusicalTime::from_ticks(10),
                value: AnimatableValue::Direction(DirectionDSL::Reverse),
                interpolation: KeyframeInterpolationDSL::Hold,
                in_tangent: None,
                out_tangent: None,
            },
        ];
        assert_eq!(
            evaluate_lane_at(&lane, MusicalTime::from_ticks(9)),
            Some(AnimatableValue::Direction(DirectionDSL::Forward))
        );
        assert_eq!(
            evaluate_lane_at(&lane, MusicalTime::from_ticks(10)),
            Some(AnimatableValue::Direction(DirectionDSL::Reverse))
        );
    }

    #[test]
    fn color_and_bezier_segments_use_lab_and_hermite_interpolation() {
        let mut color_lane = lane();
        color_lane.keyframes = vec![
            CompiledKeyframe {
                id: "red".to_string(),
                time: MusicalTime::ZERO,
                value: AnimatableValue::Color(255, 0, 0),
                interpolation: KeyframeInterpolationDSL::Linear,
                in_tangent: None,
                out_tangent: None,
            },
            CompiledKeyframe {
                id: "blue".to_string(),
                time: MusicalTime::from_ticks(10),
                value: AnimatableValue::Color(0, 0, 255),
                interpolation: KeyframeInterpolationDSL::Hold,
                in_tangent: None,
                out_tangent: None,
            },
        ];
        let (red, green, blue) = lerp_color_lab((255, 0, 0), (0, 0, 255), 0.5);
        assert_eq!(
            evaluate_lane_at(&color_lane, MusicalTime::from_ticks(5)),
            Some(AnimatableValue::Color(red, green, blue))
        );

        let mut bezier_lane = lane();
        bezier_lane.keyframes = vec![keyframe("start", 0, 0.0), keyframe("end", 100, 1.0)];
        bezier_lane.keyframes[0].interpolation = KeyframeInterpolationDSL::Bezier;
        bezier_lane.keyframes[0].out_tangent = Some(CompiledKeyframeTangent {
            time: 100.0,
            value: 0.0,
        });
        bezier_lane.keyframes[1].in_tangent = Some(CompiledKeyframeTangent {
            time: -100.0,
            value: 0.0,
        });
        assert_eq!(
            evaluate_lane_at(&bezier_lane, MusicalTime::from_ticks(25)),
            Some(AnimatableValue::Float(0.15625))
        );
        assert_eq!(
            integrate_lane_scalar_ticks(
                Some(&bezier_lane),
                MusicalTime::ZERO,
                MusicalTime::from_ticks(100),
                1.0,
            ),
            50.0
        );
    }

    #[test]
    fn prefix_index_queries_one_active_clip_from_one_thousand() {
        let clips: Vec<_> = (0..1_000)
            .map(|index| clip(&format!("clip-{index}"), index * 10, 5, 0, index as u32))
            .collect();
        let prefix_max_end = clips.iter().map(|clip| clip.end().ticks()).collect();
        let track = CompiledTimelineTrack {
            id: "large".to_string(),
            overlap_policy: OverlapPolicyDSL::Layer,
            clips,
            prefix_max_end,
        };

        let active = active_clips_at(&track, MusicalTime::from_ticks(9_992));
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].clip.id, "clip-999");
    }
}
