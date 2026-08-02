use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

pub trait Clock: Send + Sync + 'static {
    fn now(&self) -> Duration;
}

#[derive(Clone, Debug)]
pub struct MonotonicClock {
    origin: Instant,
}

impl Default for MonotonicClock {
    fn default() -> Self {
        Self {
            origin: Instant::now(),
        }
    }
}

impl Clock for MonotonicClock {
    fn now(&self) -> Duration {
        self.origin.elapsed()
    }
}

#[derive(Clone, Debug, Default)]
pub struct ManualClock {
    current: Arc<Mutex<Duration>>,
}

impl ManualClock {
    pub fn set(&self, current: Duration) {
        *self.lock_current() = current;
    }

    pub fn advance(&self, elapsed: Duration) {
        let mut current = self.lock_current();
        *current = current.saturating_add(elapsed);
    }

    fn lock_current(&self) -> std::sync::MutexGuard<'_, Duration> {
        self.current.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Clock for ManualClock {
    fn now(&self) -> Duration {
        *self.lock_current()
    }
}

#[cfg(test)]
mod tests {
    use super::{Clock, ManualClock};
    use std::time::Duration;

    #[test]
    fn manual_clock_moves_only_when_explicitly_advanced() {
        let clock = ManualClock::default();
        assert_eq!(clock.now(), Duration::ZERO);

        clock.advance(Duration::from_millis(250));
        assert_eq!(clock.now(), Duration::from_millis(250));

        clock.set(Duration::from_secs(10));
        assert_eq!(clock.now(), Duration::from_secs(10));
    }
}
