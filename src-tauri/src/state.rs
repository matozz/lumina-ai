use crate::compiler::CompiledShow;
use crate::engine::clock::Clock;
use crate::engine::frame::FramePublisher;
use crate::engine::render::LivePhaser;
use crate::engine::transport::Transport;
use crate::scheduler::Scheduler;
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
    current: RwLock<Option<ShowSnapshot>>,
    next_revision: AtomicU64,
}

impl Default for ShowStore {
    fn default() -> Self {
        Self {
            current: RwLock::new(None),
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
        *self.current.write().await = Some(snapshot.clone());
        snapshot
    }

    pub async fn current(&self) -> Option<ShowSnapshot> {
        self.current.read().await.clone()
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
    pub sequencer_mode: SequencerMode,
    pub frame_publisher: FramePublisher,
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
    use super::ShowStore;
    use crate::compiler::{CompiledShow, Fixture};
    use crate::engine::profile::{profile_handle_by_id, GENERIC_RGB_PROFILE_ID};

    #[tokio::test]
    async fn show_store_publishes_monotonic_immutable_revisions() {
        let store = ShowStore::default();
        let first = store.publish(show_with_fixture(1)).await;
        let second = store.publish(show_with_fixture(2)).await;

        assert_eq!(first.revision, 1);
        assert_eq!(second.revision, 2);
        assert_eq!(first.show.fixtures[0].id, 1);
        assert_eq!(second.show.fixtures[0].id, 2);

        let current = store.current().await.expect("current show snapshot");
        assert_eq!(current.revision, second.revision);
        assert!(std::sync::Arc::ptr_eq(&current.show, &second.show));
    }

    fn show_with_fixture(id: u32) -> CompiledShow {
        CompiledShow {
            fixtures: vec![Fixture {
                id,
                profile: profile_handle_by_id(GENERIC_RGB_PROFILE_ID)
                    .expect("built-in RGB profile"),
            }],
            ..CompiledShow::default()
        }
    }
}
