use crate::compiler::{CompiledTimeline, parser::TimelineActionDefDSL};

#[derive(Clone)]
pub enum TimelineAction {
    Start(usize, TimelineActionDefDSL),
    Stop(usize, TimelineActionDefDSL),
}

pub struct TimelineExecutor {
    timeline: CompiledTimeline,
    last_checked_beat: f64,
    active_events: Vec<(usize, f64)>, // (index, start_beat)
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
                    // Check if we are already tracking this specific event instance
                    if !self.active_events.iter().any(|(idx, _)| *idx == i) {
                        self.active_events.push((i, event.beat));
                    }
                }
            }
        }

        self.last_checked_beat = global_beat;
        actions
    }
}
