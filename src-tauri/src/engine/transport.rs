use super::clock::Clock;
use serde::Serialize;
use std::fmt;
use std::time::Duration;

pub const DEFAULT_OUTPUT_HZ: u32 = 60;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TransportState {
    Stopped,
    Playing,
    Paused,
    Seeking,
    Error,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct TransportSnapshot {
    pub state: TransportState,
    pub cursor_beat: f64,
    pub tempo_bpm: u32,
    pub revision: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TransportError {
    AlreadyPlaying,
    InvalidState(TransportState),
    InvalidTempo(u32),
    InvalidSeek,
}

impl fmt::Display for TransportError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::AlreadyPlaying => formatter.write_str("transport is already playing"),
            Self::InvalidState(state) => write!(formatter, "invalid transport state: {state:?}"),
            Self::InvalidTempo(bpm) => write!(formatter, "tempo must be greater than zero: {bpm}"),
            Self::InvalidSeek => formatter.write_str("seek target must be finite and non-negative"),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OutputRate(u32);

impl OutputRate {
    pub fn new(hz: u32) -> Result<Self, OutputRateError> {
        match hz {
            30 | 60 | 120 => Ok(Self(hz)),
            _ => Err(OutputRateError(hz)),
        }
    }

    pub fn hz(self) -> u32 {
        self.0
    }

    pub fn interval(self) -> Duration {
        Duration::from_secs_f64(1.0 / f64::from(self.0))
    }
}

impl Default for OutputRate {
    fn default() -> Self {
        Self(DEFAULT_OUTPUT_HZ)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OutputRateError(pub u32);

impl fmt::Display for OutputRateError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "unsupported output rate {}; expected 30, 60, or 120Hz",
            self.0
        )
    }
}

#[derive(Clone, Debug)]
pub struct Transport {
    state: TransportState,
    cursor_beat: f64,
    anchor_beat: f64,
    anchor_time: Duration,
    tempo_bpm: u32,
    revision: u64,
    resume_playing_after_seek: bool,
}

impl Transport {
    pub fn new(tempo_bpm: u32, now: Duration) -> Result<Self, TransportError> {
        if tempo_bpm == 0 {
            return Err(TransportError::InvalidTempo(tempo_bpm));
        }

        Ok(Self {
            state: TransportState::Stopped,
            cursor_beat: 0.0,
            anchor_beat: 0.0,
            anchor_time: now,
            tempo_bpm,
            revision: 0,
            resume_playing_after_seek: false,
        })
    }

    pub fn snapshot(&self, now: Duration) -> TransportSnapshot {
        TransportSnapshot {
            state: self.state,
            cursor_beat: self.position_at(now),
            tempo_bpm: self.tempo_bpm,
            revision: self.revision,
        }
    }

    pub fn position_at(&self, now: Duration) -> f64 {
        if self.state != TransportState::Playing {
            return self.cursor_beat;
        }

        let elapsed = now.saturating_sub(self.anchor_time).as_secs_f64();
        self.anchor_beat + elapsed * f64::from(self.tempo_bpm) / 60.0
    }

    pub fn play(&mut self, now: Duration) -> Result<TransportSnapshot, TransportError> {
        match self.state {
            TransportState::Playing => return Err(TransportError::AlreadyPlaying),
            TransportState::Seeking | TransportState::Error => {
                return Err(TransportError::InvalidState(self.state));
            }
            TransportState::Stopped | TransportState::Paused => {}
        }

        self.anchor_beat = self.cursor_beat;
        self.anchor_time = now;
        self.state = TransportState::Playing;
        self.bump_revision();
        Ok(self.snapshot(now))
    }

    pub fn pause(&mut self, now: Duration) -> Result<TransportSnapshot, TransportError> {
        if self.state != TransportState::Playing {
            return Err(TransportError::InvalidState(self.state));
        }

        self.cursor_beat = self.position_at(now);
        self.state = TransportState::Paused;
        self.bump_revision();
        Ok(self.snapshot(now))
    }

    pub fn stop(&mut self, now: Duration) -> TransportSnapshot {
        self.cursor_beat = 0.0;
        self.anchor_beat = 0.0;
        self.anchor_time = now;
        self.state = TransportState::Stopped;
        self.resume_playing_after_seek = false;
        self.bump_revision();
        self.snapshot(now)
    }

    pub fn begin_seek(
        &mut self,
        target_beat: f64,
        now: Duration,
    ) -> Result<TransportSnapshot, TransportError> {
        if !target_beat.is_finite() || target_beat < 0.0 {
            return Err(TransportError::InvalidSeek);
        }
        if matches!(self.state, TransportState::Seeking | TransportState::Error) {
            return Err(TransportError::InvalidState(self.state));
        }

        self.resume_playing_after_seek = self.state == TransportState::Playing;
        self.cursor_beat = target_beat;
        self.anchor_beat = target_beat;
        self.anchor_time = now;
        self.state = TransportState::Seeking;
        self.bump_revision();
        Ok(self.snapshot(now))
    }

    pub fn complete_seek(&mut self, now: Duration) -> Result<TransportSnapshot, TransportError> {
        if self.state != TransportState::Seeking {
            return Err(TransportError::InvalidState(self.state));
        }

        self.anchor_time = now;
        self.anchor_beat = self.cursor_beat;
        self.state = if self.resume_playing_after_seek {
            TransportState::Playing
        } else {
            TransportState::Paused
        };
        self.resume_playing_after_seek = false;
        self.bump_revision();
        Ok(self.snapshot(now))
    }

    pub fn set_tempo(
        &mut self,
        tempo_bpm: u32,
        now: Duration,
    ) -> Result<TransportSnapshot, TransportError> {
        if tempo_bpm == 0 {
            return Err(TransportError::InvalidTempo(tempo_bpm));
        }

        self.cursor_beat = self.position_at(now);
        self.anchor_beat = self.cursor_beat;
        self.anchor_time = now;
        self.tempo_bpm = tempo_bpm;
        self.bump_revision();
        Ok(self.snapshot(now))
    }

    pub fn enter_error(&mut self, now: Duration) -> TransportSnapshot {
        self.cursor_beat = self.position_at(now);
        self.state = TransportState::Error;
        self.bump_revision();
        self.snapshot(now)
    }

    fn bump_revision(&mut self) {
        self.revision = self.revision.saturating_add(1);
    }
}

#[derive(Debug)]
pub struct RealtimeCore<C: Clock> {
    clock: C,
    transport: Transport,
    output_rate: OutputRate,
}

impl<C: Clock> RealtimeCore<C> {
    pub fn new(clock: C, tempo_bpm: u32, output_rate: OutputRate) -> Result<Self, TransportError> {
        let now = clock.now();
        Ok(Self {
            clock,
            transport: Transport::new(tempo_bpm, now)?,
            output_rate,
        })
    }

    pub fn snapshot(&self) -> TransportSnapshot {
        self.transport.snapshot(self.clock.now())
    }

    pub fn play(&mut self) -> Result<TransportSnapshot, TransportError> {
        self.transport.play(self.clock.now())
    }

    pub fn pause(&mut self) -> Result<TransportSnapshot, TransportError> {
        self.transport.pause(self.clock.now())
    }

    pub fn stop(&mut self) -> TransportSnapshot {
        self.transport.stop(self.clock.now())
    }

    pub fn seek(
        &mut self,
        target_beat: f64,
    ) -> Result<(TransportSnapshot, TransportSnapshot), TransportError> {
        let now = self.clock.now();
        let seeking = self.transport.begin_seek(target_beat, now)?;
        let settled = self.transport.complete_seek(now)?;
        Ok((seeking, settled))
    }

    pub fn set_tempo(&mut self, tempo_bpm: u32) -> Result<TransportSnapshot, TransportError> {
        self.transport.set_tempo(tempo_bpm, self.clock.now())
    }

    pub fn output_rate(&self) -> OutputRate {
        self.output_rate
    }
}

#[cfg(test)]
mod tests {
    use super::{OutputRate, RealtimeCore, TransportError, TransportState};
    use crate::engine::clock::ManualClock;
    use std::time::Duration;

    fn core(clock: ManualClock) -> RealtimeCore<ManualClock> {
        RealtimeCore::new(clock, 120, OutputRate::default()).expect("valid realtime core")
    }

    #[test]
    fn derives_ten_minutes_of_logical_time_without_tick_accumulation() {
        let clock = ManualClock::default();
        let mut core = core(clock.clone());
        core.play().expect("play");

        clock.advance(Duration::from_secs(600));

        assert_eq!(core.snapshot().cursor_beat, 1_200.0);
    }

    #[test]
    fn repeated_play_is_rejected_without_changing_revision() {
        let clock = ManualClock::default();
        let mut core = core(clock);
        let playing = core.play().expect("first play");

        assert_eq!(core.play(), Err(TransportError::AlreadyPlaying));
        assert_eq!(core.snapshot().revision, playing.revision);
    }

    #[test]
    fn pause_resume_holds_then_continues_from_the_cursor() {
        let clock = ManualClock::default();
        let mut core = core(clock.clone());
        core.play().expect("play");
        clock.advance(Duration::from_secs(2));

        let paused = core.pause().expect("pause");
        assert_eq!(paused.state, TransportState::Paused);
        assert_eq!(paused.cursor_beat, 4.0);

        clock.advance(Duration::from_secs(20));
        assert_eq!(core.snapshot().cursor_beat, 4.0);

        core.play().expect("resume");
        clock.advance(Duration::from_secs(1));
        assert_eq!(core.snapshot().cursor_beat, 6.0);
    }

    #[test]
    fn stop_resets_the_cursor_and_seek_publishes_two_revisions() {
        let clock = ManualClock::default();
        let mut core = core(clock.clone());
        core.play().expect("play");
        clock.advance(Duration::from_secs(1));

        let (seeking, settled) = core.seek(42.0).expect("seek");
        assert_eq!(seeking.state, TransportState::Seeking);
        assert_eq!(seeking.cursor_beat, 42.0);
        assert_eq!(settled.state, TransportState::Playing);
        assert_eq!(settled.revision, seeking.revision + 1);

        clock.advance(Duration::from_secs(1));
        assert_eq!(core.snapshot().cursor_beat, 44.0);
        assert_eq!(core.stop().cursor_beat, 0.0);
        assert_eq!(core.snapshot().state, TransportState::Stopped);
    }

    #[test]
    fn tempo_change_preserves_the_current_cursor() {
        let clock = ManualClock::default();
        let mut core = core(clock.clone());
        core.play().expect("play");
        clock.advance(Duration::from_secs(3));

        assert_eq!(core.set_tempo(60).expect("tempo").cursor_beat, 6.0);
        clock.advance(Duration::from_secs(2));
        assert_eq!(core.snapshot().cursor_beat, 8.0);
    }

    #[test]
    fn validates_supported_output_rates() {
        for hz in [30, 60, 120] {
            let rate = OutputRate::new(hz).expect("supported rate");
            assert_eq!(rate.hz(), hz);
            assert_eq!(
                rate.interval(),
                Duration::from_secs_f64(1.0 / f64::from(hz))
            );
        }
        assert!(OutputRate::new(59).is_err());
    }
}
