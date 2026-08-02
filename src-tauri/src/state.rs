use crate::compiler::CompiledShow;
use crate::engine::clock::Clock;
use crate::engine::output::OutputHub;
use crate::engine::render::LivePhaser;
use crate::engine::transport::Transport;
use crate::scheduler::Scheduler;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct EngineState {
    pub scheduler: Scheduler,
    pub clock: Arc<dyn Clock>,
    pub shows: ShowStore,
    pub runtime: Arc<RwLock<RuntimeState>>,
}

#[derive(Clone)]
pub struct ShowSnapshot {
    pub revision: u64,
    pub show: Arc<CompiledShow>,
}

pub struct ShowStore {
    state: RwLock<ShowStoreState>,
    next_revision: AtomicU64,
}

#[derive(Default)]
struct ShowStoreState {
    snapshots: BTreeMap<u64, ShowSnapshot>,
    latest_published_revision: Option<u64>,
    live_revision: Option<u64>,
}

impl Default for ShowStore {
    fn default() -> Self {
        Self {
            state: RwLock::new(ShowStoreState::default()),
            next_revision: AtomicU64::new(1),
        }
    }
}

impl ShowStore {
    pub async fn publish(&self, show: CompiledShow) -> ShowSnapshot {
        let snapshot = ShowSnapshot {
            revision: self.next_revision.fetch_add(1, Ordering::Relaxed),
            show: Arc::new(show),
        };
        let mut state = self.state.write().await;
        state.snapshots.insert(snapshot.revision, snapshot.clone());
        state.latest_published_revision = Some(snapshot.revision);
        snapshot
    }

    pub async fn publish_and_activate(&self, show: CompiledShow) -> ShowSnapshot {
        let snapshot = self.publish(show).await;
        self.activate(snapshot.revision)
            .await
            .expect("newly published show snapshot must be available")
    }

    pub async fn activate(&self, revision: u64) -> Result<ShowSnapshot, String> {
        let mut state = self.state.write().await;
        let snapshot = state
            .snapshots
            .get(&revision)
            .cloned()
            .ok_or_else(|| format!("Published show revision {revision} does not exist."))?;
        state.live_revision = Some(revision);
        Ok(snapshot)
    }

    pub async fn latest_published(&self) -> Option<ShowSnapshot> {
        let state = self.state.read().await;
        state
            .latest_published_revision
            .and_then(|revision| state.snapshots.get(&revision).cloned())
    }

    pub async fn current(&self) -> Option<ShowSnapshot> {
        let state = self.state.read().await;
        state
            .live_revision
            .and_then(|revision| state.snapshots.get(&revision).cloned())
    }

    pub async fn revisions(&self) -> (Option<u64>, Option<u64>) {
        let state = self.state.read().await;
        (state.latest_published_revision, state.live_revision)
    }
}

#[derive(Clone, PartialEq, Debug)]
pub enum SequencerMode {
    Live,
    Timeline,
}

pub struct RuntimeState {
    pub transport: Transport,
    pub live_phasers: Vec<LivePhaser>,
    pub pending_live_actions: Vec<ScheduledLiveAction>,
    pub next_live_action_sequence: u64,
    pub sequencer_mode: SequencerMode,
    pub blackout: bool,
    pub output_rate_hz: u32,
    pub last_frame_lag_ms: f64,
    pub last_output_error: Option<String>,
    pub output_hub: OutputHub,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LivePadQuantize {
    Off,
    Beat,
    Bar,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ScheduledLiveActionKind {
    Start {
        multiplier: f64,
        exclusive_ids: Vec<String>,
    },
    Stop,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ScheduledLiveAction {
    pub effect_id: String,
    pub target_beat: f64,
    pub sequence: u64,
    pub kind: ScheduledLiveActionKind,
}

impl RuntimeState {
    pub fn queue_live_pad(
        &mut self,
        effect_id: String,
        kind: ScheduledLiveActionKind,
        quantize: LivePadQuantize,
        cursor_beat: f64,
        one_shot_beats: Option<f64>,
    ) -> f64 {
        let target_beat = quantized_beat(cursor_beat, quantize);
        let mut cancelled_ids = vec![effect_id.as_str()];
        if let ScheduledLiveActionKind::Start { exclusive_ids, .. } = &kind {
            cancelled_ids.extend(exclusive_ids.iter().map(String::as_str));
        }
        self.pending_live_actions
            .retain(|pending| !cancelled_ids.contains(&pending.effect_id.as_str()));

        self.push_live_action(effect_id.clone(), target_beat, kind);
        if let Some(duration) =
            one_shot_beats.filter(|duration| duration.is_finite() && *duration > 0.0)
        {
            self.push_live_action(
                effect_id,
                target_beat + duration,
                ScheduledLiveActionKind::Stop,
            );
        }
        target_beat
    }

    pub fn apply_due_live_actions(&mut self, cursor_beat: f64) {
        let mut due = Vec::new();
        self.pending_live_actions.retain(|pending| {
            if pending.target_beat <= cursor_beat + 1e-9 {
                due.push(pending.clone());
                false
            } else {
                true
            }
        });
        due.sort_by(|left, right| {
            left.target_beat
                .total_cmp(&right.target_beat)
                .then(left.sequence.cmp(&right.sequence))
        });

        for action in due {
            match action.kind {
                ScheduledLiveActionKind::Start {
                    multiplier,
                    exclusive_ids,
                } => {
                    self.live_phasers.retain(|active| {
                        active.id != action.effect_id && !exclusive_ids.contains(&active.id)
                    });
                    self.live_phasers.push(LivePhaser {
                        id: action.effect_id,
                        start_beat: action.target_beat,
                        phase_offset: 0.0,
                        multiplier,
                    });
                }
                ScheduledLiveActionKind::Stop => {
                    self.live_phasers
                        .retain(|active| active.id != action.effect_id);
                }
            }
        }
    }

    fn push_live_action(
        &mut self,
        effect_id: String,
        target_beat: f64,
        kind: ScheduledLiveActionKind,
    ) {
        let sequence = self.next_live_action_sequence;
        self.next_live_action_sequence = self.next_live_action_sequence.saturating_add(1);
        self.pending_live_actions.push(ScheduledLiveAction {
            effect_id,
            target_beat,
            sequence,
            kind,
        });
    }
}

fn quantized_beat(cursor_beat: f64, quantize: LivePadQuantize) -> f64 {
    let cursor = cursor_beat.max(0.0);
    match quantize {
        LivePadQuantize::Off => cursor,
        LivePadQuantize::Beat => (cursor - 1e-9).ceil().max(0.0),
        LivePadQuantize::Bar => (((cursor - 1e-9) / 4.0).ceil() * 4.0).max(0.0),
    }
}

#[derive(Clone, serde::Serialize)]
pub struct ActivePhaser {
    pub id: String,
    pub start_beat: f64,
    pub instance_id: Option<usize>, // used by timeline to uniquely identify blocks
    pub multiplier: f64,
    // Add accumulated_beat to calculate phase consistently during speed changes
    pub accumulated_beat: f64,
}

#[cfg(test)]
mod tests {
    use super::{LivePadQuantize, RuntimeState, ScheduledLiveActionKind, SequencerMode, ShowStore};
    use crate::compiler::{CompiledShow, Fixture};
    use crate::engine::attribute::resolve_attribute;
    use crate::engine::output::OutputHub;
    use crate::engine::profile::{
        profile_handle_by_id, GENERIC_RGB_PROFILE_ID, INTENSITY_ATTRIBUTE,
    };
    use crate::engine::transport::Transport;
    use std::time::Duration;

    #[tokio::test]
    async fn published_revision_does_not_replace_live_snapshot_until_activation() {
        let store = ShowStore::default();
        let first = store.publish(show_with_fixture(1)).await;
        store
            .activate(first.revision)
            .await
            .expect("activate first");
        let second = store.publish(show_with_fixture(2)).await;

        assert_eq!(first.revision, 1);
        assert_eq!(second.revision, 2);
        assert_eq!(first.show.fixtures[0].id, 1);
        assert_eq!(second.show.fixtures[0].id, 2);

        let published = store.latest_published().await.expect("published snapshot");
        let live = store.current().await.expect("live show snapshot");
        assert_eq!(published.revision, second.revision);
        assert_eq!(live.revision, first.revision);
        assert_eq!(live.show.fixtures[0].id, 1);

        let activated = store
            .activate(second.revision)
            .await
            .expect("activate second");
        assert_eq!(activated.revision, second.revision);
        assert!(std::sync::Arc::ptr_eq(&activated.show, &second.show));
        assert_eq!(store.revisions().await, (Some(2), Some(2)));
    }

    #[tokio::test]
    async fn unknown_revision_cannot_replace_live_snapshot() {
        let store = ShowStore::default();
        let first = store.publish_and_activate(show_with_fixture(1)).await;

        let error = match store.activate(99).await {
            Ok(_) => panic!("unknown revision must not activate"),
            Err(error) => error,
        };

        assert_eq!(error, "Published show revision 99 does not exist.");
        assert_eq!(
            store.current().await.expect("live").revision,
            first.revision
        );
    }

    #[test]
    fn live_pad_actions_apply_only_on_the_quantized_boundary() {
        let mut runtime = runtime_state();
        let target = runtime.queue_live_pad(
            "pulse".to_string(),
            ScheduledLiveActionKind::Start {
                multiplier: 1.0,
                exclusive_ids: Vec::new(),
            },
            LivePadQuantize::Beat,
            2.2,
            None,
        );

        assert_eq!(target, 3.0);
        runtime.apply_due_live_actions(2.999);
        assert!(runtime.live_phasers.is_empty());
        runtime.apply_due_live_actions(3.0);
        assert_eq!(runtime.live_phasers[0].id, "pulse");
        assert_eq!(runtime.live_phasers[0].start_beat, 3.0);
    }

    #[test]
    fn one_shot_and_exclusive_groups_have_deterministic_stop_order() {
        let mut runtime = runtime_state();
        runtime.queue_live_pad(
            "wash".to_string(),
            ScheduledLiveActionKind::Start {
                multiplier: 1.0,
                exclusive_ids: Vec::new(),
            },
            LivePadQuantize::Off,
            0.0,
            None,
        );
        runtime.apply_due_live_actions(0.0);

        runtime.queue_live_pad(
            "pulse".to_string(),
            ScheduledLiveActionKind::Start {
                multiplier: 1.0,
                exclusive_ids: vec!["wash".to_string()],
            },
            LivePadQuantize::Bar,
            1.0,
            Some(4.0),
        );
        runtime.apply_due_live_actions(3.999);
        assert_eq!(runtime.live_phasers[0].id, "wash");
        runtime.apply_due_live_actions(4.0);
        assert_eq!(runtime.live_phasers[0].id, "pulse");
        runtime.apply_due_live_actions(8.0);
        assert!(runtime.live_phasers.is_empty());
    }

    #[test]
    fn momentary_release_before_the_boundary_cancels_the_pending_start() {
        let mut runtime = runtime_state();
        runtime.queue_live_pad(
            "pulse".to_string(),
            ScheduledLiveActionKind::Start {
                multiplier: 1.0,
                exclusive_ids: Vec::new(),
            },
            LivePadQuantize::Bar,
            1.0,
            None,
        );
        runtime.queue_live_pad(
            "pulse".to_string(),
            ScheduledLiveActionKind::Stop,
            LivePadQuantize::Bar,
            1.5,
            None,
        );

        runtime.apply_due_live_actions(4.0);
        assert!(runtime.live_phasers.is_empty());
        assert!(runtime.pending_live_actions.is_empty());
    }

    fn show_with_fixture(id: u32) -> CompiledShow {
        CompiledShow {
            fixtures: vec![fixture(id)],
            ..CompiledShow::default()
        }
    }

    fn runtime_state() -> RuntimeState {
        RuntimeState {
            transport: Transport::new(120, Duration::ZERO).expect("transport"),
            live_phasers: Vec::new(),
            pending_live_actions: Vec::new(),
            next_live_action_sequence: 0,
            sequencer_mode: SequencerMode::Live,
            blackout: false,
            output_rate_hz: 60,
            last_frame_lag_ms: 0.0,
            last_output_error: None,
            output_hub: OutputHub::default(),
        }
    }

    fn fixture(id: u32) -> Fixture {
        let profile = profile_handle_by_id(GENERIC_RGB_PROFILE_ID).expect("built-in RGB profile");
        Fixture {
            id,
            profile,
            intensity: resolve_attribute(profile, INTENSITY_ATTRIBUTE),
        }
    }
}
