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
    pub sequencer_mode: SequencerMode,
    pub output_hub: OutputHub,
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
    use crate::engine::attribute::resolve_attribute;
    use crate::engine::profile::{
        profile_handle_by_id, GENERIC_RGB_PROFILE_ID, INTENSITY_ATTRIBUTE,
    };

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

    fn show_with_fixture(id: u32) -> CompiledShow {
        CompiledShow {
            fixtures: vec![fixture(id)],
            ..CompiledShow::default()
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
