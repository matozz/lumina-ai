use crate::compiler::{parser::TimelineActionDefDSL, CompiledTimeline};
use crate::engine::animation::{ease, AnimatableValue};

#[derive(Clone)]
pub enum TimelineAction {
    Start(usize, TimelineActionDefDSL),
    Stop(usize, TimelineActionDefDSL),
    UpdateParameter(String, AnimatableValue),
}

pub struct TimelineExecutor {
    timeline: CompiledTimeline,
    last_checked_beat: f64,
    active_events: Vec<(usize, f64)>, // (index, start_beat)
}

fn parse_animatable_value(val: &serde_json::Value) -> Option<AnimatableValue> {
    if let Some(f) = val.as_f64() {
        return Some(AnimatableValue::Float(f));
    }
    if let Some(s) = val.as_str() {
        // Very basic color parsing for "#RRGGBB"
        if s.starts_with('#') && s.len() == 7 {
            if let (Ok(r), Ok(g), Ok(b)) = (
                u8::from_str_radix(&s[1..3], 16),
                u8::from_str_radix(&s[3..5], 16),
                u8::from_str_radix(&s[5..7], 16),
            ) {
                return Some(AnimatableValue::Color(r, g, b));
            }
        }
    }
    None
}

impl TimelineExecutor {
    pub fn new(timeline: CompiledTimeline) -> Self {
        Self {
            timeline,
            last_checked_beat: -1.0,
            active_events: Vec::new(),
        }
    }

    pub fn tick(&mut self, global_beat: f64) -> Vec<TimelineAction> {
        let mut actions = Vec::new();

        // 1. Process stops for events that have ended
        let mut next_active = Vec::new();
        for (i, start) in &self.active_events {
            let event = &self.timeline.events[*i];
            let end_beat = start + event.duration.unwrap_or(f64::MAX);
            if global_beat >= end_beat {
                actions.push(TimelineAction::Stop(*i, event.action.clone()));
            } else {
                next_active.push((*i, *start));
            }
        }
        self.active_events = next_active;

        // 2. Process starts for new events
        for (i, event) in self.timeline.events.iter().enumerate() {
            if event.beat > self.last_checked_beat && event.beat <= global_beat {
                actions.push(TimelineAction::Start(i, event.action.clone()));
                if event.duration.is_some() && !self.active_events.iter().any(|(idx, _)| *idx == i)
                {
                    self.active_events.push((i, event.beat));
                }
            }
        }

        // 3. Process running updates (interpolations for animation tracks)
        for (i, start) in &self.active_events {
            let event = &self.timeline.events[*i];
            if let TimelineActionDefDSL::Animate {
                target,
                from,
                to,
                easing,
            } = &event.action
            {
                let local_time = global_beat - start;
                let duration = event.duration.unwrap_or(4.0); // fallback duration if none provided, though animate events should have one

                let val_start = parse_animatable_value(from);
                let val_end = parse_animatable_value(to);

                if let (Some(vs), Some(ve)) = (val_start, val_end) {
                    if local_time >= duration {
                        // Beyond last frame, hold the last value
                        actions.push(TimelineAction::UpdateParameter(target.clone(), ve));
                    } else if local_time <= 0.0 {
                        // Before first frame (should not happen if beat > start, but for safety)
                        actions.push(TimelineAction::UpdateParameter(target.clone(), vs));
                    } else {
                        // Interpolate
                        let progress = local_time / duration;
                        let easing_str = easing.as_deref().unwrap_or("linear");
                        let t = ease(progress, easing_str);
                        let current_val = vs.lerp(&ve, t);
                        actions.push(TimelineAction::UpdateParameter(target.clone(), current_val));
                    }
                }
            }
        }

        self.last_checked_beat = global_beat;
        actions
    }
}

#[cfg(test)]
mod tests {
    use super::{TimelineAction, TimelineExecutor};
    use crate::compiler::{parser::TimelineActionDefDSL, CompiledTimeline};
    use crate::engine::animation::AnimatableValue;

    fn timeline() -> CompiledTimeline {
        CompiledTimeline {
            events: vec![
                crate::compiler::parser::TimelineEventDSL {
                    beat: 1.0,
                    duration: Some(1.0),
                    action: TimelineActionDefDSL::Phaser {
                        phaser: "pulse".to_string(),
                    },
                },
                crate::compiler::parser::TimelineEventDSL {
                    beat: 2.0,
                    duration: Some(2.0),
                    action: TimelineActionDefDSL::Animate {
                        target: "global.master_dimmer".to_string(),
                        from: serde_json::json!(0.0),
                        to: serde_json::json!(1.0),
                        easing: Some("linear".to_string()),
                    },
                },
            ],
        }
    }

    #[test]
    fn starts_and_stops_timeline_phaser_at_declared_beats() {
        let mut executor = TimelineExecutor::new(timeline());

        assert!(executor.tick(0.5).is_empty());
        let starts = executor.tick(1.0);
        assert!(matches!(
            starts.as_slice(),
            [TimelineAction::Start(
                0,
                TimelineActionDefDSL::Phaser { phaser }
            )] if phaser == "pulse"
        ));

        let at_end = executor.tick(2.0);
        assert!(matches!(
            at_end.first(),
            Some(TimelineAction::Stop(
                0,
                TimelineActionDefDSL::Phaser { phaser }
            )) if phaser == "pulse"
        ));
    }

    #[test]
    fn emits_interpolated_parameter_values_for_active_animation() {
        let mut executor = TimelineExecutor::new(timeline());

        executor.tick(2.0);
        let actions = executor.tick(3.0);
        assert!(actions.iter().any(|action| {
            matches!(
                action,
                TimelineAction::UpdateParameter(target, AnimatableValue::Float(value))
                    if target == "global.master_dimmer" && (*value - 0.5).abs() < 1e-12
            )
        }));
    }
}
