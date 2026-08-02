use super::attribute::FixtureFrame;
use super::frame::{FramePayload, FramePublisher};
use serde::Serialize;
use std::collections::VecDeque;
use std::fmt;
use std::sync::{Arc, Mutex, MutexGuard};

pub const SINK_NOT_RUNNING: &str = "SINK_NOT_RUNNING";
pub const SINK_STATE_UNAVAILABLE: &str = "SINK_STATE_UNAVAILABLE";

#[derive(Clone, Debug, PartialEq)]
pub struct LogicalFrame {
    pub show_revision: u64,
    pub logical_beat: f64,
    pub outputs: Arc<[FixtureFrame]>,
}

impl LogicalFrame {
    pub fn new(show_revision: u64, logical_beat: f64, outputs: Vec<FixtureFrame>) -> Self {
        Self {
            show_revision,
            logical_beat,
            outputs: Arc::from(outputs),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct SinkCapabilities {
    pub id: &'static str,
    pub delivery: SinkDelivery,
    pub supports_blackout: bool,
    pub max_buffered_frames: Option<usize>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SinkDelivery {
    BestEffort,
    Backpressured,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SinkSendOutcome {
    Accepted,
    DroppedBackpressure,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SinkStatus {
    Stopped,
    Healthy,
    Degraded,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SinkHealth {
    pub status: SinkStatus,
    pub accepted_frames: u64,
    pub dropped_frames: u64,
    pub last_show_revision: Option<u64>,
    pub last_error: Option<String>,
}

impl SinkHealth {
    fn stopped() -> Self {
        Self {
            status: SinkStatus::Stopped,
            accepted_frames: 0,
            dropped_frames: 0,
            last_show_revision: None,
            last_error: None,
        }
    }

    fn state_unavailable() -> Self {
        Self {
            status: SinkStatus::Failed,
            accepted_frames: 0,
            dropped_frames: 0,
            last_show_revision: None,
            last_error: Some("Sink state mutex is unavailable.".to_string()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SinkError {
    pub code: &'static str,
    pub message: String,
}

impl SinkError {
    fn not_running(id: &str) -> Self {
        Self {
            code: SINK_NOT_RUNNING,
            message: format!("Output sink {id:?} is not running."),
        }
    }

    fn state_unavailable(id: &str) -> Self {
        Self {
            code: SINK_STATE_UNAVAILABLE,
            message: format!("Output sink {id:?} state is unavailable."),
        }
    }
}

impl fmt::Display for SinkError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

pub trait OutputSink: Send + Sync {
    fn capabilities(&self) -> SinkCapabilities;
    fn start(&self) -> Result<(), SinkError>;
    fn send(&self, frame: Arc<LogicalFrame>) -> Result<SinkSendOutcome, SinkError>;
    fn blackout(&self, frame: Arc<LogicalFrame>) -> Result<SinkSendOutcome, SinkError>;
    fn health(&self) -> SinkHealth;
    fn stop(&self) -> Result<(), SinkError>;
}

#[derive(Debug)]
pub struct NullSink {
    state: Mutex<BasicSinkState>,
}

impl Default for NullSink {
    fn default() -> Self {
        Self {
            state: Mutex::new(BasicSinkState::default()),
        }
    }
}

impl OutputSink for NullSink {
    fn capabilities(&self) -> SinkCapabilities {
        SinkCapabilities {
            id: "null",
            delivery: SinkDelivery::Backpressured,
            supports_blackout: true,
            max_buffered_frames: Some(0),
        }
    }

    fn start(&self) -> Result<(), SinkError> {
        let mut state = lock_state(&self.state, "null")?;
        state.running = true;
        state.health.status = SinkStatus::Healthy;
        state.health.last_error = None;
        Ok(())
    }

    fn send(&self, frame: Arc<LogicalFrame>) -> Result<SinkSendOutcome, SinkError> {
        accept_basic_frame(&self.state, "null", &frame)
    }

    fn blackout(&self, frame: Arc<LogicalFrame>) -> Result<SinkSendOutcome, SinkError> {
        accept_basic_frame(&self.state, "null", &frame)
    }

    fn health(&self) -> SinkHealth {
        self.state
            .lock()
            .map(|state| state.health.clone())
            .unwrap_or_else(|_| SinkHealth::state_unavailable())
    }

    fn stop(&self) -> Result<(), SinkError> {
        stop_basic_sink(&self.state, "null")
    }
}

#[derive(Debug)]
pub struct PreviewSink {
    state: Mutex<PreviewSinkState>,
}

impl Default for PreviewSink {
    fn default() -> Self {
        Self {
            state: Mutex::new(PreviewSinkState {
                running: false,
                publisher: FramePublisher::default(),
                pending_payload: None,
                health: SinkHealth::stopped(),
            }),
        }
    }
}

impl PreviewSink {
    pub fn request_full(&self) -> Result<(), SinkError> {
        lock_state(&self.state, "preview")?.publisher.request_full();
        Ok(())
    }

    pub fn take_payload(&self) -> Result<Option<FramePayload>, SinkError> {
        Ok(lock_state(&self.state, "preview")?.pending_payload.take())
    }

    #[cfg(test)]
    pub fn frame_sequence(&self) -> u64 {
        self.state
            .lock()
            .map(|state| state.publisher.frame_sequence())
            .unwrap_or(0)
    }

    fn publish(
        &self,
        frame: Arc<LogicalFrame>,
        blackout: bool,
    ) -> Result<SinkSendOutcome, SinkError> {
        let mut state = lock_state(&self.state, "preview")?;
        if !state.running {
            return Err(SinkError::not_running("preview"));
        }
        let payload = if blackout {
            state.publisher.publish_full(
                frame.show_revision,
                frame.logical_beat,
                frame.outputs.clone(),
            )
        } else {
            state.publisher.publish(
                frame.show_revision,
                frame.logical_beat,
                frame.outputs.clone(),
            )
        };
        let outcome = if state.pending_payload.replace(payload).is_some() {
            state.health.dropped_frames = state.health.dropped_frames.saturating_add(1);
            state.health.status = SinkStatus::Degraded;
            SinkSendOutcome::DroppedBackpressure
        } else {
            SinkSendOutcome::Accepted
        };
        state.health.accepted_frames = state.health.accepted_frames.saturating_add(1);
        state.health.last_show_revision = Some(frame.show_revision);
        Ok(outcome)
    }
}

impl OutputSink for PreviewSink {
    fn capabilities(&self) -> SinkCapabilities {
        SinkCapabilities {
            id: "preview",
            delivery: SinkDelivery::BestEffort,
            supports_blackout: true,
            max_buffered_frames: Some(1),
        }
    }

    fn start(&self) -> Result<(), SinkError> {
        let mut state = lock_state(&self.state, "preview")?;
        state.running = true;
        state.health.status = SinkStatus::Healthy;
        state.health.last_error = None;
        Ok(())
    }

    fn send(&self, frame: Arc<LogicalFrame>) -> Result<SinkSendOutcome, SinkError> {
        self.publish(frame, false)
    }

    fn blackout(&self, frame: Arc<LogicalFrame>) -> Result<SinkSendOutcome, SinkError> {
        self.publish(frame, true)
    }

    fn health(&self) -> SinkHealth {
        self.state
            .lock()
            .map(|state| state.health.clone())
            .unwrap_or_else(|_| SinkHealth::state_unavailable())
    }

    fn stop(&self) -> Result<(), SinkError> {
        let mut state = lock_state(&self.state, "preview")?;
        state.running = false;
        state.pending_payload = None;
        state.health.status = SinkStatus::Stopped;
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RecordedFrameKind {
    Frame,
    Blackout,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RecordedFrame {
    pub kind: RecordedFrameKind,
    pub frame: Arc<LogicalFrame>,
}

#[derive(Debug)]
pub struct RecordingSink {
    capacity: usize,
    state: Mutex<RecordingSinkState>,
}

impl RecordingSink {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            state: Mutex::new(RecordingSinkState {
                running: false,
                frames: VecDeque::new(),
                health: SinkHealth::stopped(),
            }),
        }
    }

    pub fn take_frames(&self) -> Result<Vec<RecordedFrame>, SinkError> {
        Ok(lock_state(&self.state, "recording")?
            .frames
            .drain(..)
            .collect())
    }

    fn record(
        &self,
        frame: Arc<LogicalFrame>,
        kind: RecordedFrameKind,
    ) -> Result<SinkSendOutcome, SinkError> {
        let mut state = lock_state(&self.state, "recording")?;
        if !state.running {
            return Err(SinkError::not_running("recording"));
        }
        if state.frames.len() >= self.capacity {
            state.health.dropped_frames = state.health.dropped_frames.saturating_add(1);
            state.health.status = SinkStatus::Degraded;
            return Ok(SinkSendOutcome::DroppedBackpressure);
        }
        state.frames.push_back(RecordedFrame {
            kind,
            frame: frame.clone(),
        });
        state.health.accepted_frames = state.health.accepted_frames.saturating_add(1);
        state.health.last_show_revision = Some(frame.show_revision);
        Ok(SinkSendOutcome::Accepted)
    }
}

impl OutputSink for RecordingSink {
    fn capabilities(&self) -> SinkCapabilities {
        SinkCapabilities {
            id: "recording",
            delivery: SinkDelivery::Backpressured,
            supports_blackout: true,
            max_buffered_frames: Some(self.capacity),
        }
    }

    fn start(&self) -> Result<(), SinkError> {
        let mut state = lock_state(&self.state, "recording")?;
        state.running = true;
        state.health.status = SinkStatus::Healthy;
        state.health.last_error = None;
        Ok(())
    }

    fn send(&self, frame: Arc<LogicalFrame>) -> Result<SinkSendOutcome, SinkError> {
        self.record(frame, RecordedFrameKind::Frame)
    }

    fn blackout(&self, frame: Arc<LogicalFrame>) -> Result<SinkSendOutcome, SinkError> {
        self.record(frame, RecordedFrameKind::Blackout)
    }

    fn health(&self) -> SinkHealth {
        self.state
            .lock()
            .map(|state| state.health.clone())
            .unwrap_or_else(|_| SinkHealth::state_unavailable())
    }

    fn stop(&self) -> Result<(), SinkError> {
        let mut state = lock_state(&self.state, "recording")?;
        state.running = false;
        state.health.status = SinkStatus::Stopped;
        Ok(())
    }
}

pub struct OutputHub {
    preview: Arc<PreviewSink>,
    sinks: Vec<Arc<dyn OutputSink>>,
}

impl fmt::Debug for OutputHub {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("OutputHub")
            .field("sink_count", &self.sinks.len())
            .finish()
    }
}

impl Default for OutputHub {
    fn default() -> Self {
        let preview = Arc::new(PreviewSink::default());
        let _ = preview.start();
        Self {
            preview: preview.clone(),
            sinks: vec![preview],
        }
    }
}

impl OutputHub {
    pub fn register(&mut self, sink: Arc<dyn OutputSink>) -> Result<(), SinkError> {
        sink.start()?;
        self.sinks.push(sink);
        Ok(())
    }

    pub fn dispatch(&self, frame: Arc<LogicalFrame>, blackout: bool) -> DispatchReport {
        let mut report = DispatchReport::default();
        for sink in &self.sinks {
            let capabilities = sink.capabilities();
            let result = if blackout {
                sink.blackout(frame.clone())
            } else {
                sink.send(frame.clone())
            };
            match result {
                Ok(SinkSendOutcome::Accepted) => report.accepted += 1,
                Ok(SinkSendOutcome::DroppedBackpressure) => report.dropped += 1,
                Err(error) => report.errors.push(SinkDispatchError {
                    sink_id: capabilities.id,
                    error,
                }),
            }
        }
        report
    }

    pub fn request_preview_full(&self) -> Result<(), SinkError> {
        self.preview.request_full()
    }

    pub fn take_preview_payload(&self) -> Result<Option<FramePayload>, SinkError> {
        self.preview.take_payload()
    }

    pub fn preview_health(&self) -> SinkHealth {
        self.preview.health()
    }

    pub fn stop(&self) -> Vec<SinkDispatchError> {
        self.sinks
            .iter()
            .filter_map(|sink| {
                sink.stop().err().map(|error| SinkDispatchError {
                    sink_id: sink.capabilities().id,
                    error,
                })
            })
            .collect()
    }

    #[cfg(test)]
    pub fn preview_frame_sequence(&self) -> u64 {
        self.preview.frame_sequence()
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct DispatchReport {
    pub accepted: usize,
    pub dropped: usize,
    pub errors: Vec<SinkDispatchError>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SinkDispatchError {
    pub sink_id: &'static str,
    pub error: SinkError,
}

#[derive(Debug)]
struct BasicSinkState {
    running: bool,
    health: SinkHealth,
}

impl Default for BasicSinkState {
    fn default() -> Self {
        Self {
            running: false,
            health: SinkHealth::stopped(),
        }
    }
}

#[derive(Debug)]
struct PreviewSinkState {
    running: bool,
    publisher: FramePublisher,
    pending_payload: Option<FramePayload>,
    health: SinkHealth,
}

#[derive(Debug)]
struct RecordingSinkState {
    running: bool,
    frames: VecDeque<RecordedFrame>,
    health: SinkHealth,
}

fn accept_basic_frame(
    state: &Mutex<BasicSinkState>,
    id: &'static str,
    frame: &LogicalFrame,
) -> Result<SinkSendOutcome, SinkError> {
    let mut state = lock_state(state, id)?;
    if !state.running {
        return Err(SinkError::not_running(id));
    }
    state.health.accepted_frames = state.health.accepted_frames.saturating_add(1);
    state.health.last_show_revision = Some(frame.show_revision);
    Ok(SinkSendOutcome::Accepted)
}

fn stop_basic_sink(state: &Mutex<BasicSinkState>, id: &'static str) -> Result<(), SinkError> {
    let mut state = lock_state(state, id)?;
    state.running = false;
    state.health.status = SinkStatus::Stopped;
    Ok(())
}

fn lock_state<'a, T>(
    state: &'a Mutex<T>,
    id: &'static str,
) -> Result<MutexGuard<'a, T>, SinkError> {
    state.lock().map_err(|_| SinkError::state_unavailable(id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::attribute::{resolve_attribute, FixtureFrame};
    use crate::engine::profile::{
        profile_handle_by_id, AttributeValue, GENERIC_MOVING_HEAD_PROFILE_ID, PAN_ATTRIBUTE,
        TILT_ATTRIBUTE,
    };

    fn moving_frame(revision: u64, pan: f32, tilt: f32) -> Arc<LogicalFrame> {
        let profile = profile_handle_by_id(GENERIC_MOVING_HEAD_PROFILE_ID).expect("moving profile");
        let mut fixture = FixtureFrame::with_profile_defaults(7, profile);
        fixture.set(
            resolve_attribute(profile, PAN_ATTRIBUTE).expect("pan"),
            AttributeValue::Angle(pan),
        );
        fixture.set(
            resolve_attribute(profile, TILT_ATTRIBUTE).expect("tilt"),
            AttributeValue::Angle(tilt),
        );
        Arc::new(LogicalFrame::new(revision, 12.5, vec![fixture]))
    }

    #[test]
    fn null_sink_enforces_lifecycle_and_reports_health() {
        let sink = NullSink::default();
        let frame = moving_frame(3, 10.0, -20.0);
        assert_eq!(
            sink.send(frame.clone()).expect_err("must be started").code,
            SINK_NOT_RUNNING
        );

        sink.start().expect("start null sink");
        assert_eq!(sink.send(frame.clone()), Ok(SinkSendOutcome::Accepted));
        assert_eq!(sink.blackout(frame), Ok(SinkSendOutcome::Accepted));
        assert_eq!(sink.health().accepted_frames, 2);
        sink.stop().expect("stop null sink");
        assert_eq!(sink.health().status, SinkStatus::Stopped);
    }

    #[test]
    fn recording_sink_preserves_moving_head_attributes_and_signals_backpressure() {
        let sink = RecordingSink::new(1);
        sink.start().expect("start recording");
        let first = moving_frame(4, 90.0, -45.0);
        let second = moving_frame(5, 180.0, 30.0);

        assert_eq!(sink.send(first.clone()), Ok(SinkSendOutcome::Accepted));
        assert_eq!(sink.send(second), Ok(SinkSendOutcome::DroppedBackpressure));
        let recordings = sink.take_frames().expect("recordings");
        assert_eq!(recordings.len(), 1);
        assert!(Arc::ptr_eq(&recordings[0].frame, &first));
        assert_eq!(recordings[0].kind, RecordedFrameKind::Frame);
        let fixture = &recordings[0].frame.outputs[0];
        assert_eq!(
            fixture.value(resolve_attribute(fixture.profile, PAN_ATTRIBUTE).expect("pan")),
            Some(&AttributeValue::Angle(90.0))
        );
        assert_eq!(
            fixture.value(resolve_attribute(fixture.profile, TILT_ATTRIBUTE).expect("tilt")),
            Some(&AttributeValue::Angle(-45.0))
        );
        assert_eq!(sink.health().dropped_frames, 1);
    }

    #[test]
    fn preview_and_recording_receive_the_same_logical_frame_revision() {
        let recording = Arc::new(RecordingSink::new(8));
        let mut hub = OutputHub::default();
        hub.register(recording.clone()).expect("register recording");
        let frame = moving_frame(9, 120.0, -60.0);

        let report = hub.dispatch(frame.clone(), false);
        assert_eq!(report.accepted, 2);
        assert!(report.errors.is_empty());
        let preview = hub
            .take_preview_payload()
            .expect("preview state")
            .expect("preview payload");
        let recorded = recording.take_frames().expect("recording payload");

        assert_eq!(preview.show_revision, frame.show_revision);
        assert_eq!(preview.logical_beat, frame.logical_beat);
        assert_eq!(preview.outputs[0], frame.outputs[0].to_payload());
        assert!(Arc::ptr_eq(&recorded[0].frame, &frame));
    }

    #[test]
    fn blackout_is_full_in_preview_and_explicit_in_recording() {
        let recording = Arc::new(RecordingSink::new(8));
        let mut hub = OutputHub::default();
        hub.register(recording.clone()).expect("register recording");
        let frame = moving_frame(11, 0.0, 0.0);

        hub.dispatch(frame, true);
        let preview = hub
            .take_preview_payload()
            .expect("preview state")
            .expect("blackout preview");
        let recorded = recording.take_frames().expect("blackout recording");

        assert!(preview.full);
        assert_eq!(recorded[0].kind, RecordedFrameKind::Blackout);
    }
}
