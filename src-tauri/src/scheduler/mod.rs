use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use crate::state::EngineState;
use crate::engine::{compute_frame, compute_frame_diff};

#[derive(Clone)]
pub struct Scheduler {
    running: Arc<AtomicBool>,
    tempo: Arc<AtomicU32>,
}

#[derive(Clone, serde::Serialize)]
pub struct FramePayload {
    pub beat: f64,
    pub full: bool,
    pub outputs: Vec<crate::engine::FixtureOutput>,
}

#[derive(Clone, serde::Serialize)]
pub struct EngineStatePayload {
    pub is_playing: bool,
    pub tempo: u32,
    pub global_beat: f64,
    pub active_phasers: Vec<crate::state::ActivePhaser>,
    pub current_cue: Option<crate::state::CueInfo>,
}

#[derive(Clone, serde::Serialize)]
pub struct BeatPayload {
    pub beat: f64,
}

impl Scheduler {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            tempo: Arc::new(AtomicU32::new(120)),
        }
    }

    pub fn start(&self, app: AppHandle, state: Arc<EngineState>, subdivision: u32) {
        let running = self.running.clone();
        let tempo = self.tempo.clone();
        running.store(true, Ordering::SeqCst);

        std::thread::spawn(move || {
            let mut next_tick = Instant::now();
            let rt = tokio::runtime::Runtime::new().unwrap();
            
            // Read initial global_beat from state when starting/resuming
            let mut global_beat = rt.block_on(async {
                state.runtime.read().await.global_beat
            });
            let mut last_integer_beat: i64 = global_beat.floor() as i64;

            while running.load(Ordering::SeqCst) {
                let bpm = tempo.load(Ordering::Relaxed) as f64;
                let tick_interval = Duration::from_secs_f64(60.0 / (bpm * subdivision as f64));
                let delta_beat = 1.0 / subdivision as f64;

                next_tick += tick_interval;
                global_beat += delta_beat;

                let (payload, state_payload) = rt.block_on(async {
                    let mut r_state = state.runtime.write().await;
                    let show_guard = state.compiled_show.read().await;
                    
                    r_state.global_beat = global_beat;
                    r_state.is_playing = true;
                    
                    // Accumulate phase for active phasers based on current multiplier
                    let mut updates: Vec<(usize, f64)> = Vec::new();
                    for (i, active) in r_state.active_phasers.iter().enumerate() {
                        let dynamic_multiplier = r_state.parameter_context
                            .get_float(&format!("phaser:{}.multiplier", active.id))
                            .unwrap_or(active.multiplier);
                        updates.push((i, delta_beat * dynamic_multiplier));
                    }
                    for (i, amt) in updates {
                        r_state.active_phasers[i].accumulated_beat += amt;
                    }

                    // Tick timeline and sequence
                    if r_state.sequencer_mode == crate::state::SequencerMode::Timeline {
                        if let Some(ref mut timeline) = r_state.timeline_executor {
                            let actions = timeline.tick(global_beat);
                            for action in actions {
                                match action {
                                    crate::engine::timeline::TimelineAction::Start(instance_id, def) => {
                                        match def {
                                            crate::compiler::parser::TimelineActionDefDSL::Phaser { phaser } => {
                                                // Only add if this specific instance isn't already active
                                                if !r_state.active_phasers.iter().any(|p| p.id == phaser && p.instance_id == Some(instance_id)) {
                                                    r_state.active_phasers.push(crate::state::ActivePhaser {
                                                        id: phaser,
                                                        start_beat: global_beat,
                                                        instance_id: Some(instance_id),
                                                        multiplier: 1.0,
                                                        accumulated_beat: 0.0,
                                                    });
                                                }
                                            }
                                            _ => {} // Other actions not fully implemented yet
                                        }
                                    }
                                    crate::engine::timeline::TimelineAction::Stop(instance_id, def) => {
                                        match def {
                                            crate::compiler::parser::TimelineActionDefDSL::Phaser { phaser } => {
                                                // Only remove this specific instance
                                                r_state.active_phasers.retain(|p| !(p.id == phaser && p.instance_id == Some(instance_id)));
                                            }
                                            _ => {}
                                        }
                                    }
                                    crate::engine::timeline::TimelineAction::UpdateParameter(target, value) => {
                                        r_state.parameter_context.write_value(&target, value);
                                    }
                                }
                            }
                        }
                    }

                    // (Omitted the action execution logic for simplicity, could be added later)
                    // if let Some(ref mut seq) = r_state.sequence_executor {
                    //     seq.tick(global_beat);
                    // }

                    let current_frame;
                    let full;

                    if let Some(show) = &*show_guard {
                        let frame = compute_frame(
                            global_beat, 
                            &r_state.active_phasers, 
                            show,
                            &r_state.parameter_context
                        );
                        
                        // we can send diffs
                        let diff = compute_frame_diff(&r_state.prev_frame, &frame);
                        current_frame = frame.clone();
                        r_state.prev_frame = frame;
                        
                        // For simplicity let's just say full = false if diff is small, but if there's an action full = true
                        full = false;

                        // Create payload
                        let payload = FramePayload {
                            beat: global_beat,
                            full,
                            outputs: if full { current_frame } else { diff },
                        };

                        let state_payload = EngineStatePayload {
                            is_playing: true,
                            tempo: tempo.load(Ordering::Relaxed),
                            global_beat,
                            active_phasers: r_state.active_phasers.clone(),
                            current_cue: r_state.current_cue.clone(),
                        };

                        (Some(payload), Some(state_payload))
                    } else {
                        (None, None)
                    }
                });

                if let Some(p) = payload {
                    let _ = app.emit("engine:frame-update", p);
                }

                if let Some(sp) = state_payload {
                    let _ = app.emit("engine:state-change", sp);
                }

                let current_int_beat = global_beat.floor() as i64;
                if current_int_beat > last_integer_beat {
                    let _ = app.emit("engine:beat", BeatPayload { beat: current_int_beat as f64 });
                    last_integer_beat = current_int_beat;
                }

                let now = Instant::now();
                if next_tick > now {
                    let wait = next_tick - now;
                    if wait > Duration::from_millis(2) {
                        std::thread::sleep(wait - Duration::from_millis(1));
                    }
                    while Instant::now() < next_tick {
                        std::hint::spin_loop();
                    }
                } else {
                    // Skip if behind
                    next_tick = now;
                }
            }

            // when stopped
            rt.block_on(async {
                let mut r_state = state.runtime.write().await;
                r_state.is_playing = false;
                let sp = EngineStatePayload {
                    is_playing: false,
                    tempo: tempo.load(Ordering::Relaxed),
                    global_beat: r_state.global_beat,
                    active_phasers: r_state.active_phasers.clone(),
                    current_cue: r_state.current_cue.clone(),
                };
                let _ = app.emit("engine:state-change", sp);
            });
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
    
    pub fn reset_beat(&self) {
        // Only relevant if we have internal beat state in the scheduler thread
        // For now, the global beat is entirely derived from `state.runtime.global_beat` 
        // but we manage our own local `global_beat` var inside the run loop.
        // We'll need to communicate this reset to the thread if it's running.
        // Since we modify r_state in `reset_beat` command, the next time `start` is called
        // it starts from 0 anyway, but let's signal a reset via an atomic if it's currently running.
    }

    pub fn set_tempo(&self, bpm: u32) {
        self.tempo.store(bpm, Ordering::Relaxed);
    }
}
