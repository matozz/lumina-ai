pub const DEFAULT_PPQ: u32 = 960;
pub const DEFAULT_BEATS_PER_BAR: u32 = 4;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct MusicalTime(u64);

impl MusicalTime {
    pub const ZERO: Self = Self(0);

    pub const fn from_ticks(ticks: u64) -> Self {
        Self(ticks)
    }

    pub const fn ticks(self) -> u64 {
        self.0
    }

    pub fn from_beats(beats: f64, ppq: u32) -> Option<Self> {
        if !beats.is_finite() || beats < 0.0 || ppq == 0 {
            return None;
        }
        let ticks = beats * f64::from(ppq);
        if ticks > u64::MAX as f64 {
            return None;
        }
        Some(Self(ticks.round() as u64))
    }

    pub fn as_beats(self, ppq: u32) -> f64 {
        self.0 as f64 / f64::from(ppq)
    }

    pub fn checked_add(self, duration: u64) -> Option<Self> {
        self.0.checked_add(duration).map(Self)
    }

    pub const fn bar_beat_tick(self, ppq: u32, beats_per_bar: u32) -> Option<BarBeatTick> {
        if ppq == 0 || beats_per_bar == 0 {
            return None;
        }
        let ticks_per_bar = ppq as u64 * beats_per_bar as u64;
        Some(BarBeatTick {
            bar: self.0 / ticks_per_bar + 1,
            beat: self.0 % ticks_per_bar / ppq as u64 + 1,
            tick: self.0 % ppq as u64,
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BarBeatTick {
    pub bar: u64,
    pub beat: u64,
    pub tick: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TempoPoint {
    pub time: MusicalTime,
    pub micros_per_quarter: u32,
}

impl TempoPoint {
    pub fn from_bpm(time: MusicalTime, bpm: f64) -> Option<Self> {
        if !bpm.is_finite() || bpm <= 0.0 {
            return None;
        }
        let micros = (60_000_000.0 / bpm).round();
        if micros < 1.0 || micros > f64::from(u32::MAX) {
            return None;
        }
        Some(Self {
            time,
            micros_per_quarter: micros as u32,
        })
    }

    pub fn bpm(self) -> f64 {
        60_000_000.0 / f64::from(self.micros_per_quarter)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TempoMap {
    ppq: u32,
    points: Vec<TempoPoint>,
}

impl TempoMap {
    pub fn new(ppq: u32, mut points: Vec<TempoPoint>) -> Result<Self, &'static str> {
        if ppq == 0 {
            return Err("PPQ must be greater than zero");
        }
        points.sort_by_key(|point| point.time);
        if points
            .first()
            .is_none_or(|point| point.time != MusicalTime::ZERO)
        {
            return Err("TempoMap must start at tick zero");
        }
        if points.windows(2).any(|pair| pair[0].time == pair[1].time) {
            return Err("TempoMap points must use unique ticks");
        }
        Ok(Self { ppq, points })
    }

    pub fn constant(ppq: u32, bpm: f64) -> Option<Self> {
        Self::new(ppq, vec![TempoPoint::from_bpm(MusicalTime::ZERO, bpm)?]).ok()
    }

    pub const fn ppq(&self) -> u32 {
        self.ppq
    }

    pub fn points(&self) -> &[TempoPoint] {
        &self.points
    }

    pub fn micros_at(&self, time: MusicalTime) -> u64 {
        let mut micros = 0_u128;
        for (index, point) in self.points.iter().enumerate() {
            if point.time >= time {
                break;
            }
            let end = self
                .points
                .get(index + 1)
                .map_or(time, |next| next.time.min(time));
            let ticks = end.ticks() - point.time.ticks();
            micros +=
                u128::from(ticks) * u128::from(point.micros_per_quarter) / u128::from(self.ppq);
            if end == time {
                break;
            }
        }
        u64::try_from(micros).unwrap_or(u64::MAX)
    }

    pub fn time_at_micros(&self, target_micros: u64) -> MusicalTime {
        let mut elapsed = 0_u128;
        for (index, point) in self.points.iter().enumerate() {
            let Some(next) = self.points.get(index + 1) else {
                let remaining = u128::from(target_micros).saturating_sub(elapsed);
                let ticks = remaining * u128::from(self.ppq) / u128::from(point.micros_per_quarter);
                return MusicalTime::from_ticks(
                    point
                        .time
                        .ticks()
                        .saturating_add(u64::try_from(ticks).unwrap_or(u64::MAX)),
                );
            };
            let segment_ticks = next.time.ticks() - point.time.ticks();
            let segment_micros = u128::from(segment_ticks) * u128::from(point.micros_per_quarter)
                / u128::from(self.ppq);
            if elapsed + segment_micros > u128::from(target_micros) {
                let remaining = u128::from(target_micros) - elapsed;
                let ticks = remaining * u128::from(self.ppq) / u128::from(point.micros_per_quarter);
                return MusicalTime::from_ticks(
                    point.time.ticks() + u64::try_from(ticks).unwrap_or(u64::MAX),
                );
            }
            elapsed += segment_micros;
        }
        MusicalTime::ZERO
    }
}

#[cfg(test)]
mod tests {
    use super::{MusicalTime, TempoMap, TempoPoint, DEFAULT_PPQ};

    #[test]
    fn musical_time_rounds_once_at_the_compatibility_boundary() {
        let time = MusicalTime::from_beats(3.5, DEFAULT_PPQ).expect("finite beat");
        assert_eq!(time.ticks(), 3_360);
        assert_eq!(time.as_beats(DEFAULT_PPQ), 3.5);
        let display = time.bar_beat_tick(DEFAULT_PPQ, 4).expect("time signature");
        assert_eq!(display.bar, 1);
        assert_eq!(display.beat, 4);
        assert_eq!(display.tick, 480);
    }

    #[test]
    fn constant_tempo_has_exact_integer_boundaries() {
        let map = TempoMap::constant(DEFAULT_PPQ, 120.0).expect("tempo map");
        assert_eq!(map.micros_at(MusicalTime::from_ticks(960)), 500_000);
        assert_eq!(map.micros_at(MusicalTime::from_ticks(3_840)), 2_000_000);
        assert_eq!(map.time_at_micros(2_000_000).ticks(), 3_840);
    }

    #[test]
    fn tempo_map_converts_across_segments_without_tick_accumulation() {
        let map = TempoMap::new(
            DEFAULT_PPQ,
            vec![
                TempoPoint::from_bpm(MusicalTime::ZERO, 120.0).expect("120 BPM"),
                TempoPoint::from_bpm(MusicalTime::from_ticks(3_840), 60.0).expect("60 BPM"),
            ],
        )
        .expect("tempo map");

        assert_eq!(map.micros_at(MusicalTime::from_ticks(3_840)), 2_000_000);
        assert_eq!(map.micros_at(MusicalTime::from_ticks(5_760)), 4_000_000);
        assert_eq!(map.time_at_micros(4_000_000).ticks(), 5_760);
    }
}
