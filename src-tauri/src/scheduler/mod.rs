use crate::engine::attribute::FixtureFrame;
use crate::engine::output::LogicalFrame;
use crate::engine::render::{render_at, RenderSource, RenderTime};
use crate::engine::transport::{OutputRate, TransportError, TransportSnapshot, TransportState};
use crate::state::{EngineState, SequencerMode};
use serde::Serialize;
use std::fmt;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::{watch, Mutex};
use tokio::task::JoinHandle;
use tokio::time::{interval, MissedTickBehavior};

/// Lock order: scheduler lifecycle -> completed ShowStore operation -> runtime state.
/// The worker never locks lifecycle, and no code awaits ShowStore while holding runtime state.
pub struct Scheduler {
    lifecycle: Mutex<SchedulerLifecycle>,
}

struct SchedulerLifecycle {
    worker: Option<Worker>,
    output_rate: OutputRate,
}

struct Worker {
    cancel: watch::Sender<bool>,
    handle: JoinHandle<()>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SchedulerError {
    AlreadyPlaying,
    Transport(TransportError),
    WorkerJoin(String),
}

impl fmt::Display for SchedulerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::AlreadyPlaying => formatter.write_str("scheduler worker is already running"),
            Self::Transport(error) => write!(formatter, "{error}"),
            Self::WorkerJoin(error) => {
                write!(formatter, "scheduler worker failed to join: {error}")
            }
        }
    }
}

impl From<TransportError> for SchedulerError {
    fn from(error: TransportError) -> Self {
        Self::Transport(error)
    }
}

#[derive(Clone, Serialize)]
pub struct EngineStatePayload {
    pub transport_state: TransportState,
    pub transport_revision: u64,
    pub tempo: u32,
    pub global_beat: f64,
    pub active_phasers: Vec<ActivePhaserPayload>,
}

#[derive(Clone, Serialize)]
pub struct ActivePhaserPayload {
    pub id: String,
    pub multiplier: f64,
}

impl Default for Scheduler {
    fn default() -> Self {
        Self::new()
    }
}

impl Scheduler {
    pub fn new() -> Self {
        Self::with_output_rate(OutputRate::default())
    }

    pub fn with_output_rate(output_rate: OutputRate) -> Self {
        Self {
            lifecycle: Mutex::new(SchedulerLifecycle {
                worker: None,
                output_rate,
            }),
        }
    }

    pub async fn play<R: Runtime>(
        &self,
        app: AppHandle<R>,
        state: Arc<EngineState>,
    ) -> Result<(), SchedulerError> {
        let mut lifecycle = self.lifecycle.lock().await;
        self.clear_finished_worker(&mut lifecycle).await?;
        if lifecycle.worker.is_some() {
            return Err(SchedulerError::AlreadyPlaying);
        }

        let snapshot = {
            let mut runtime = state.runtime.write().await;
            runtime.transport.play(state.clock.now())?
        };
        emit_state(&app, &state, snapshot).await;
        lifecycle.worker = Some(spawn_worker(app, state, lifecycle.output_rate));
        Ok(())
    }

    pub async fn pause<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        state: &Arc<EngineState>,
    ) -> Result<(), SchedulerError> {
        let mut lifecycle = self.lifecycle.lock().await;
        stop_worker(&mut lifecycle).await?;
        let snapshot = {
            let mut runtime = state.runtime.write().await;
            runtime.transport.pause(state.clock.now())?
        };
        emit_state(app, state, snapshot).await;
        Ok(())
    }

    pub async fn stop<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        state: &Arc<EngineState>,
    ) -> Result<(), SchedulerError> {
        let mut lifecycle = self.lifecycle.lock().await;
        stop_worker(&mut lifecycle).await?;
        let snapshot = {
            let mut runtime = state.runtime.write().await;
            runtime.live_phasers.clear();
            runtime.transport.stop(state.clock.now())
        };
        publish_blackout(app, state, snapshot).await;
        emit_state(app, state, snapshot).await;
        Ok(())
    }

    pub async fn seek<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        state: &Arc<EngineState>,
        target_beat: f64,
    ) -> Result<(), SchedulerError> {
        let mut lifecycle = self.lifecycle.lock().await;
        stop_worker(&mut lifecycle).await?;
        let now = state.clock.now();
        let seeking = {
            let mut runtime = state.runtime.write().await;
            runtime.transport.begin_seek(target_beat, now)?
        };
        emit_state(app, state, seeking).await;

        let settled = {
            let mut runtime = state.runtime.write().await;
            runtime.transport.complete_seek(now)?
        };
        render_and_emit(app, state, true).await;
        emit_state(app, state, settled).await;

        if settled.state == TransportState::Playing {
            lifecycle.worker = Some(spawn_worker(
                app.clone(),
                state.clone(),
                lifecycle.output_rate,
            ));
        }
        Ok(())
    }

    pub async fn set_tempo<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        state: &Arc<EngineState>,
        bpm: u32,
    ) -> Result<(), SchedulerError> {
        let snapshot = {
            let mut runtime = state.runtime.write().await;
            runtime.transport.set_tempo(bpm, state.clock.now())?
        };
        emit_state(app, state, snapshot).await;
        Ok(())
    }

    pub async fn set_output_rate(&self, output_rate: OutputRate) -> Result<(), SchedulerError> {
        let mut lifecycle = self.lifecycle.lock().await;
        self.clear_finished_worker(&mut lifecycle).await?;
        if lifecycle.worker.is_some() {
            return Err(SchedulerError::AlreadyPlaying);
        }
        lifecycle.output_rate = output_rate;
        Ok(())
    }

    pub async fn shutdown(&self, state: &Arc<EngineState>) -> Result<(), SchedulerError> {
        let mut lifecycle = self.lifecycle.lock().await;
        stop_worker(&mut lifecycle).await?;
        let mut runtime = state.runtime.write().await;
        runtime.live_phasers.clear();
        runtime.transport.stop(state.clock.now());
        let _ = runtime.output_hub.stop();
        Ok(())
    }

    async fn clear_finished_worker(
        &self,
        lifecycle: &mut SchedulerLifecycle,
    ) -> Result<(), SchedulerError> {
        let is_finished = lifecycle
            .worker
            .as_ref()
            .is_some_and(|worker| worker.handle.is_finished());
        if is_finished {
            if let Some(worker) = lifecycle.worker.take() {
                worker
                    .handle
                    .await
                    .map_err(|error| SchedulerError::WorkerJoin(error.to_string()))?;
            }
        }
        Ok(())
    }

    #[cfg(test)]
    async fn is_running(&self) -> bool {
        self.lifecycle
            .lock()
            .await
            .worker
            .as_ref()
            .is_some_and(|worker| !worker.handle.is_finished())
    }
}

fn spawn_worker<R: Runtime>(
    app: AppHandle<R>,
    state: Arc<EngineState>,
    output_rate: OutputRate,
) -> Worker {
    let (cancel, mut cancelled) = watch::channel(false);
    let handle = tokio::spawn(async move {
        let mut ticker = interval(output_rate.interval());
        ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

        loop {
            tokio::select! {
                biased;
                changed = cancelled.changed() => {
                    if changed.is_err() || *cancelled.borrow() {
                        break;
                    }
                }
                _ = ticker.tick() => render_and_emit(&app, &state, false).await,
            }
        }
    });
    Worker { cancel, handle }
}

async fn stop_worker(lifecycle: &mut SchedulerLifecycle) -> Result<(), SchedulerError> {
    let Some(worker) = lifecycle.worker.take() else {
        return Ok(());
    };
    let _ = worker.cancel.send(true);
    worker
        .handle
        .await
        .map_err(|error| SchedulerError::WorkerJoin(error.to_string()))
}

async fn render_and_emit<R: Runtime>(
    app: &AppHandle<R>,
    state: &Arc<EngineState>,
    force_full: bool,
) {
    let show_snapshot = state.shows.current().await;
    let now = state.clock.now();
    let (transport, mode, live_phasers) = {
        let runtime = state.runtime.read().await;
        (
            runtime.transport.snapshot(now),
            runtime.sequencer_mode.clone(),
            runtime.live_phasers.clone(),
        )
    };

    if let Some(show_snapshot) = show_snapshot {
        let source = match mode {
            SequencerMode::Timeline => RenderSource::Timeline,
            SequencerMode::Live => RenderSource::Live(&live_phasers),
        };
        let frame = render_at(
            &show_snapshot.show,
            RenderTime {
                beat: transport.cursor_beat,
            },
            source,
        );
        let payload = {
            let runtime = state.runtime.write().await;
            if force_full {
                let _ = runtime.output_hub.request_preview_full();
            }
            let logical_frame = Arc::new(LogicalFrame::new(
                show_snapshot.revision,
                transport.cursor_beat,
                frame,
            ));
            let _ = runtime.output_hub.dispatch(logical_frame, false);
            runtime.output_hub.take_preview_payload().ok().flatten()
        };
        if let Some(payload) = payload {
            let _ = app.emit("engine:frame-update", payload);
        }
    }

    emit_state(app, state, transport).await;
}

async fn publish_blackout<R: Runtime>(
    app: &AppHandle<R>,
    state: &Arc<EngineState>,
    transport: TransportSnapshot,
) {
    let Some(show_snapshot) = state.shows.current().await else {
        return;
    };
    let blackout = show_snapshot
        .show
        .fixtures
        .iter()
        .map(|fixture| FixtureFrame::with_profile_defaults(fixture.id, fixture.profile))
        .collect();
    let payload = {
        let runtime = state.runtime.write().await;
        let logical_frame = Arc::new(LogicalFrame::new(
            show_snapshot.revision,
            transport.cursor_beat,
            blackout,
        ));
        let _ = runtime.output_hub.dispatch(logical_frame, true);
        runtime.output_hub.take_preview_payload().ok().flatten()
    };
    if let Some(payload) = payload {
        let _ = app.emit("engine:frame-update", payload);
    }
}

async fn emit_state<R: Runtime>(
    app: &AppHandle<R>,
    state: &Arc<EngineState>,
    transport: TransportSnapshot,
) {
    let active_phasers = state
        .runtime
        .read()
        .await
        .live_phasers
        .iter()
        .map(|phaser| ActivePhaserPayload {
            id: phaser.id.clone(),
            multiplier: phaser.multiplier,
        })
        .collect();
    let payload = EngineStatePayload {
        transport_state: transport.state,
        transport_revision: transport.revision,
        tempo: transport.tempo_bpm,
        global_beat: transport.cursor_beat,
        active_phasers,
    };
    let _ = app.emit("engine:state-change", payload);
}

#[cfg(test)]
mod tests {
    use super::{Scheduler, SchedulerError};
    use crate::compiler::{CompiledShow, Fixture};
    use crate::engine::clock::{Clock, ManualClock};
    use crate::engine::output::{OutputHub, RecordingSink};
    use crate::engine::profile::{profile_handle_by_id, GENERIC_RGB_PROFILE_ID};
    use crate::engine::render::LivePhaser;
    use crate::engine::transport::{OutputRate, Transport, TransportState};
    use crate::state::{EngineState, RuntimeState, SequencerMode, ShowStore};
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::sync::RwLock;

    fn engine_state(output_rate: OutputRate) -> (Arc<EngineState>, ManualClock) {
        let clock = ManualClock::default();
        let state = Arc::new(EngineState {
            scheduler: Scheduler::with_output_rate(output_rate),
            clock: Arc::new(clock.clone()),
            shows: ShowStore::default(),
            runtime: Arc::new(RwLock::new(RuntimeState {
                transport: Transport::new(120, clock.now()).expect("transport"),
                live_phasers: Vec::new(),
                sequencer_mode: SequencerMode::Timeline,
                output_hub: OutputHub::default(),
            })),
        });
        (state, clock)
    }

    #[tokio::test]
    async fn repeated_play_returns_already_playing_and_keeps_one_worker() {
        let app = tauri::test::mock_app();
        let (state, _) = engine_state(OutputRate::default());

        state
            .scheduler
            .play(app.handle().clone(), state.clone())
            .await
            .expect("first play");
        assert_eq!(
            state
                .scheduler
                .play(app.handle().clone(), state.clone())
                .await,
            Err(SchedulerError::AlreadyPlaying)
        );
        assert!(state.scheduler.is_running().await);

        state
            .scheduler
            .pause(app.handle(), &state)
            .await
            .expect("pause and join");
        assert!(!state.scheduler.is_running().await);
    }

    #[tokio::test]
    async fn pause_holds_cursor_and_stop_resets_with_joined_worker() {
        let app = tauri::test::mock_app();
        let (state, clock) = engine_state(OutputRate::default());
        state
            .scheduler
            .play(app.handle().clone(), state.clone())
            .await
            .expect("play");
        state.runtime.write().await.live_phasers.push(LivePhaser {
            id: "live".to_string(),
            start_beat: 0.0,
            phase_offset: 0.0,
            multiplier: 1.0,
        });
        clock.advance(Duration::from_secs(2));
        state
            .scheduler
            .pause(app.handle(), &state)
            .await
            .expect("pause");

        let paused = state.runtime.read().await.transport.snapshot(clock.now());
        assert_eq!(paused.state, TransportState::Paused);
        assert_eq!(paused.cursor_beat, 4.0);
        assert_eq!(state.runtime.read().await.live_phasers.len(), 1);
        clock.advance(Duration::from_secs(20));
        assert_eq!(
            state
                .runtime
                .read()
                .await
                .transport
                .snapshot(clock.now())
                .cursor_beat,
            4.0
        );

        state
            .scheduler
            .stop(app.handle(), &state)
            .await
            .expect("stop");
        let stopped = state.runtime.read().await.transport.snapshot(clock.now());
        assert_eq!(stopped.state, TransportState::Stopped);
        assert_eq!(stopped.cursor_beat, 0.0);
        assert!(state.runtime.read().await.live_phasers.is_empty());
        assert!(!state.scheduler.is_running().await);
    }

    #[tokio::test]
    async fn seek_rebuilds_immediately_and_resumes_the_single_worker() {
        let app = tauri::test::mock_app();
        let (state, clock) = engine_state(OutputRate::default());
        state
            .shows
            .publish_and_activate(CompiledShow {
                fixtures: vec![fixture(1)],
                ..CompiledShow::default()
            })
            .await;
        state
            .scheduler
            .play(app.handle().clone(), state.clone())
            .await
            .expect("play");
        clock.advance(Duration::from_secs(2));

        state
            .scheduler
            .seek(app.handle(), &state, 42.0)
            .await
            .expect("seek");

        let transport = state.runtime.read().await.transport.snapshot(clock.now());
        assert_eq!(transport.state, TransportState::Playing);
        assert_eq!(transport.cursor_beat, 42.0);
        assert_eq!(transport.revision, 3);
        assert!(
            state
                .runtime
                .read()
                .await
                .output_hub
                .preview_frame_sequence()
                >= 1
        );
        assert!(state.scheduler.is_running().await);

        state
            .scheduler
            .pause(app.handle(), &state)
            .await
            .expect("pause");
    }

    #[tokio::test]
    async fn configured_output_rate_drives_the_publisher_frequency() {
        let app = tauri::test::mock_app();
        for hz in [30, 60, 120] {
            let output_rate = OutputRate::new(hz).expect("rate");
            let (state, _) = engine_state(output_rate);
            state
                .shows
                .publish_and_activate(CompiledShow {
                    fixtures: vec![fixture(1)],
                    ..CompiledShow::default()
                })
                .await;
            state
                .scheduler
                .play(app.handle().clone(), state.clone())
                .await
                .expect("play");
            tokio::time::sleep(Duration::from_millis(250)).await;

            let sequence = state
                .runtime
                .read()
                .await
                .output_hub
                .preview_frame_sequence();
            let expected = u64::from(hz) / 4;
            let tolerance = expected / 3 + 1;
            assert!(
                (expected - tolerance..=expected + tolerance).contains(&sequence),
                "{hz}Hz produced {sequence} frames"
            );
            state
                .scheduler
                .pause(app.handle(), &state)
                .await
                .expect("pause");
        }
    }

    #[tokio::test]
    async fn scheduler_fans_the_same_show_revision_to_preview_and_recording_sinks() {
        let app = tauri::test::mock_app();
        let (state, _) = engine_state(OutputRate::default());
        let snapshot = state.shows.publish_and_activate(show_with_fixture(1)).await;
        let recording = Arc::new(RecordingSink::new(16));
        state
            .runtime
            .write()
            .await
            .output_hub
            .register(recording.clone())
            .expect("register recording sink");

        state
            .scheduler
            .play(app.handle().clone(), state.clone())
            .await
            .expect("play through output hub");
        tokio::time::sleep(Duration::from_millis(40)).await;
        state
            .scheduler
            .pause(app.handle(), &state)
            .await
            .expect("pause output hub test");

        let recorded = recording.take_frames().expect("recorded logical frames");
        assert!(!recorded.is_empty());
        assert!(recorded
            .iter()
            .all(|frame| frame.frame.show_revision == snapshot.revision));
        assert_eq!(
            state
                .runtime
                .read()
                .await
                .output_hub
                .preview_health()
                .last_show_revision,
            Some(snapshot.revision)
        );
    }

    #[tokio::test]
    async fn shutdown_joins_active_worker_and_resets_transient_state() {
        let app = tauri::test::mock_app();
        let (state, clock) = engine_state(OutputRate::default());
        state.shows.publish_and_activate(show_with_fixture(1)).await;
        state.runtime.write().await.live_phasers.push(LivePhaser {
            id: "active".to_string(),
            start_beat: 0.0,
            phase_offset: 0.0,
            multiplier: 1.0,
        });

        state
            .scheduler
            .play(app.handle().clone(), state.clone())
            .await
            .expect("play before shutdown");
        clock.advance(Duration::from_secs(2));
        assert!(state.scheduler.is_running().await);

        state.scheduler.shutdown(&state).await.expect("shutdown");

        assert!(!state.scheduler.is_running().await);
        let runtime = state.runtime.read().await;
        assert!(runtime.live_phasers.is_empty());
        let transport = runtime.transport.snapshot(clock.now());
        assert_eq!(transport.state, TransportState::Stopped);
        assert_eq!(transport.cursor_beat, 0.0);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrent_reload_transport_and_resync_finishes_without_deadlock() {
        let app = tauri::test::mock_app();
        let (state, clock) = engine_state(OutputRate::default());
        state.shows.publish_and_activate(show_with_fixture(1)).await;

        let transport = async {
            for iteration in 0..40 {
                state
                    .scheduler
                    .play(app.handle().clone(), state.clone())
                    .await
                    .expect("stress play");
                clock.advance(Duration::from_millis(16));
                state
                    .scheduler
                    .seek(app.handle(), &state, f64::from(iteration))
                    .await
                    .expect("stress seek");
                if iteration % 2 == 0 {
                    state
                        .scheduler
                        .pause(app.handle(), &state)
                        .await
                        .expect("stress pause");
                } else {
                    state
                        .scheduler
                        .stop(app.handle(), &state)
                        .await
                        .expect("stress stop");
                }
            }
        };
        let reload = async {
            for revision in 2..=101 {
                state.shows.publish(show_with_fixture(revision)).await;
                tokio::task::yield_now().await;
            }
        };
        let resync = async {
            for _ in 0..200 {
                state
                    .runtime
                    .write()
                    .await
                    .output_hub
                    .request_preview_full()
                    .expect("preview resync");
                tokio::task::yield_now().await;
            }
        };

        tokio::time::timeout(Duration::from_secs(10), async {
            tokio::join!(transport, reload, resync);
        })
        .await
        .expect("concurrent operations must not deadlock");

        assert_eq!(
            state
                .shows
                .latest_published()
                .await
                .expect("latest published show")
                .revision,
            101
        );
        assert_eq!(state.shows.current().await.expect("live show").revision, 1);
        assert!(!state.scheduler.is_running().await);
        assert_eq!(
            state
                .runtime
                .read()
                .await
                .transport
                .snapshot(clock.now())
                .state,
            TransportState::Stopped
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
            intensity: crate::engine::attribute::resolve_attribute(
                profile,
                crate::engine::profile::INTENSITY_ATTRIBUTE,
            ),
        }
    }
}
