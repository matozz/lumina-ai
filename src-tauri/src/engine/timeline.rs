use crate::compiler::{CompiledTimeline, parser::TimelineActionDefDSL};
use crate::engine::animation::{AnimatableValue, ease};

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
                u8::from_str_radix(&s[5..7], 16)
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
            let end_beat = start + event.duration.unwrap_or(std::f64::MAX);
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
                if event.duration.is_some() {
                    if !self.active_events.iter().any(|(idx, _)| *idx == i) {
                        self.active_events.push((i, event.beat));
                    }
                }
            }
        }

        // 3. Process running updates (interpolations for animation tracks)
        for (i, start) in &self.active_events {
            let event = &self.timeline.events[*i];
            if let TimelineActionDefDSL::Animate { target, keyframes } = &event.action {
                let local_time = global_beat - start;
                
                // Find current and next keyframe
                if keyframes.is_empty() {
                    continue;
                }
                
                let mut current_kf = &keyframes[0];
                let mut next_kf = &keyframes[keyframes.len() - 1];
                
                for kf in keyframes {
                    if kf.time <= local_time {
                        current_kf = kf;
                    }
                }
                
                for kf in keyframes.iter().rev() {
                    if kf.time > local_time {
                        next_kf = kf;
                    }
                }
                
                let val_start = parse_animatable_value(&current_kf.value);
                let val_end = parse_animatable_value(&next_kf.value);
                
                if let (Some(vs), Some(ve)) = (val_start, val_end) {
                    if current_kf.time >= next_kf.time || local_time >= next_kf.time {
                        // Beyond last frame or same frame
                        actions.push(TimelineAction::UpdateParameter(target.clone(), vs));
                    } else {
                        // Interpolate
                        let progress = (local_time - current_kf.time) / (next_kf.time - current_kf.time);
                        let easing = next_kf.easing.as_deref().unwrap_or("linear");
                        let t = ease(progress, easing);
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
