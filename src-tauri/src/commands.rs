use crate::compiler::parser::ShowDSL;
use crate::compiler::{diagnostic::Diagnostic, Compiler, LayoutCoord};
use crate::state::{ActivePhaser, EngineState};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime, State};

#[derive(serde::Serialize, Clone)]
pub struct PhaserInfo {
    pub id: String,
    pub name: String,
}

#[derive(serde::Serialize)]
pub struct CompileResult {
    pub success: bool,
    pub fixture_count: usize,
    pub layout_coords: Vec<LayoutCoord>,
    pub group_names: Vec<String>,
    pub phasers: Vec<PhaserInfo>,
    pub sequence_names: Vec<String>,
    pub errors: Vec<Diagnostic>,
    pub warnings: Vec<Diagnostic>,
}

#[tauri::command]
pub async fn load_dsl(
    dsl_json: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<CompileResult, Diagnostic> {
    let dsl: ShowDSL =
        serde_json::from_str(&dsl_json).map_err(|error| Diagnostic::json_parse(&error))?;
    let mut group_names: Vec<String> = Vec::new();
    for g in &dsl.groups {
        if !group_names.contains(&g.name) {
            group_names.push(g.name.clone());
        }
    }

    let mut phasers: Vec<PhaserInfo> = Vec::new();
    for p in &dsl.phasers {
        if !phasers.iter().any(|info| info.id == p.id) {
            phasers.push(PhaserInfo {
                id: p.id.clone(),
                name: p.name.clone(),
            });
        }
    }

    let compiled = Compiler::compile(dsl);

    let mut result = CompileResult {
        success: false,
        fixture_count: 0,
        layout_coords: vec![],
        group_names: vec![],
        phasers: vec![],
        sequence_names: vec![],
        errors: vec![],
        warnings: vec![],
    };

    match compiled {
        Ok(c) => {
            result.success = true;
            result.fixture_count = c.fixtures.len();
            result.layout_coords = c.coords.clone();
            result.group_names = group_names;
            result.phasers = phasers;

            let mut show_guard = state.compiled_show.write().await;

            // Reset active phasers when loading a new DSL (both live and timeline mode)
            let mut r_state = state.runtime.write().await;
            r_state.active_phasers.clear();

            // If in timeline mode, re-initialize timeline executor with new DSL
            if r_state.sequencer_mode == crate::state::SequencerMode::Timeline {
                if let Some(timeline) = &c.timeline {
                    r_state.timeline_executor = Some(
                        crate::engine::timeline::TimelineExecutor::new(timeline.clone()),
                    );
                } else {
                    r_state.timeline_executor = None;
                }
            }

            *show_guard = Some(c);
        }
        Err(e) => {
            result.errors = e;
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn validate_dsl(dsl_json: String) -> Result<Vec<Diagnostic>, Diagnostic> {
    let dsl: ShowDSL =
        serde_json::from_str(&dsl_json).map_err(|error| Diagnostic::json_parse(&error))?;
    let compiled = Compiler::compile(dsl);
    match compiled {
        Ok(_) => Ok(vec![]),
        Err(e) => Ok(e),
    }
}

#[tauri::command]
pub async fn play(app_handle: AppHandle, state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    play_engine(app_handle, state.inner().clone());
    Ok(())
}

fn play_engine<R: Runtime>(app_handle: AppHandle<R>, state: Arc<EngineState>) {
    state.scheduler.start(app_handle, state.clone(), 8);
}

#[tauri::command]
pub async fn stop(app_handle: AppHandle, state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    stop_engine(&app_handle, state.inner()).await
}

async fn stop_engine<R: Runtime>(
    app_handle: &AppHandle<R>,
    state: &Arc<EngineState>,
) -> Result<(), String> {
    state.scheduler.stop();
    let mut r_state = state.runtime.write().await;
    r_state.is_playing = false;
    r_state.active_phasers.clear(); // Reset active phasers on stop

    // Clear the canvas by computing a blackout frame
    let show_guard = state.compiled_show.read().await;
    if let Some(show) = &*show_guard {
        let black_frame = crate::engine::compute_frame(
            r_state.global_beat,
            &[],
            show,
            &r_state.parameter_context,
        );
        r_state.prev_frame = black_frame.clone();

        let payload = crate::scheduler::FramePayload {
            beat: r_state.global_beat,
            full: true,
            outputs: black_frame,
        };
        let _ = app_handle.emit("engine:frame-update", payload);
    }

    Ok(())
}

#[tauri::command]
pub async fn reset_beat(state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    reset_beat_engine(state.inner()).await
}

async fn reset_beat_engine(state: &Arc<EngineState>) -> Result<(), String> {
    let mut r_state = state.runtime.write().await;
    r_state.global_beat = 0.0;
    state.scheduler.reset_beat();

    // Also reset any active timeline execution state since we jumped in time
    if r_state.sequencer_mode == crate::state::SequencerMode::Timeline {
        r_state.active_phasers.clear();
        let show_guard = state.compiled_show.read().await;
        if let Some(show) = &*show_guard {
            if let Some(timeline) = &show.timeline {
                r_state.timeline_executor = Some(crate::engine::timeline::TimelineExecutor::new(
                    timeline.clone(),
                ));
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn set_tempo(bpm: u32, state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    state.scheduler.set_tempo(bpm);
    Ok(())
}

#[tauri::command]
pub async fn trigger_phaser(
    phaser_id: String,
    multiplier: f64,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    let mut r_state = state.runtime.write().await;
    if let Some(phaser) = r_state
        .active_phasers
        .iter_mut()
        .find(|p| p.id == phaser_id)
    {
        phaser.multiplier = multiplier;
    } else {
        let beat = r_state.global_beat;
        r_state.active_phasers.push(ActivePhaser {
            id: phaser_id,
            start_beat: beat,
            instance_id: None,
            multiplier,
            accumulated_beat: 0.0,
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn stop_phaser(
    phaser_id: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    let mut r_state = state.runtime.write().await;
    r_state.active_phasers.retain(|p| p.id != phaser_id);
    Ok(())
}

#[tauri::command]
pub async fn save_show(path: String, dsl_json: String) -> Result<(), String> {
    let _: ShowDSL =
        serde_json::from_str(&dsl_json).map_err(|e| format!("JSON formatting error: {}", e))?;
    tokio::fs::write(&path, dsl_json.as_bytes())
        .await
        .map_err(|e| format!("File write error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn load_show(path: String) -> Result<String, String> {
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("File read error: {}", e))?;
    let _: ShowDSL =
        serde_json::from_str(&content).map_err(|e| format!("DSL parse error: {}", e))?;
    Ok(content)
}

#[tauri::command]
pub async fn set_sequencer_mode(
    mode: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    let mut r_state = state.runtime.write().await;
    r_state.sequencer_mode = match mode.as_str() {
        "timeline" => crate::state::SequencerMode::Timeline,
        _ => crate::state::SequencerMode::Live,
    };

    // Clear active phasers when switching modes
    r_state.active_phasers.clear();

    // If switching to timeline mode, re-initialize timeline executor
    if r_state.sequencer_mode == crate::state::SequencerMode::Timeline {
        let show_guard = state.compiled_show.read().await;
        if let Some(show) = &*show_guard {
            if let Some(timeline) = &show.timeline {
                r_state.timeline_executor = Some(crate::engine::timeline::TimelineExecutor::new(
                    timeline.clone(),
                ));
            }
        }
    } else {
        r_state.timeline_executor = None;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_layout_coords(
    state: State<'_, Arc<EngineState>>,
) -> Result<Vec<LayoutCoord>, String> {
    let show = state.compiled_show.read().await;
    if let Some(s) = &*show {
        Ok(s.coords.clone())
    } else {
        Ok(vec![])
    }
}

#[cfg(test)]
mod tests {
    use super::{play_engine, reset_beat_engine, stop_engine};
    use crate::engine::animation::ParameterContext;
    use crate::scheduler::Scheduler;
    use crate::state::{ActivePhaser, EngineState, RuntimeState, SequencerMode};
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::runtime::Runtime;
    use tokio::sync::RwLock;

    fn engine_state() -> Arc<EngineState> {
        Arc::new(EngineState {
            scheduler: Scheduler::new(),
            compiled_show: Arc::new(RwLock::new(None)),
            runtime: Arc::new(RwLock::new(RuntimeState {
                global_beat: 0.0,
                is_playing: false,
                active_phasers: vec![ActivePhaser {
                    id: "baseline".to_string(),
                    start_beat: 0.0,
                    instance_id: None,
                    multiplier: 1.0,
                    accumulated_beat: 0.0,
                }],
                sequencer_mode: SequencerMode::Live,
                timeline_executor: None,
                prev_frame: Vec::new(),
                parameter_context: ParameterContext::new(),
            })),
        })
    }

    fn accumulated_after_starts(start_count: usize) -> f64 {
        let app = tauri::test::mock_app();
        let state = engine_state();
        for _ in 0..start_count {
            play_engine(app.handle().clone(), state.clone());
        }
        std::thread::sleep(Duration::from_millis(220));
        state.scheduler.stop();
        std::thread::sleep(Duration::from_millis(100));

        Runtime::new()
            .expect("test runtime")
            .block_on(async { state.runtime.read().await.active_phasers[0].accumulated_beat })
    }

    #[test]
    fn baseline_repeated_play_starts_multiple_workers() {
        let single_start_phase = accumulated_after_starts(1);
        let repeated_start_phase = accumulated_after_starts(2);

        assert!(single_start_phase > 0.0);
        assert!(
            repeated_start_phase > single_start_phase * 1.5,
            "Stage 1 must replace this characterization with a single-worker assertion"
        );
    }

    #[test]
    fn baseline_pause_resume_via_stop_loses_active_phasers() {
        let app = tauri::test::mock_app();
        let state = engine_state();
        let runtime = Runtime::new().expect("test runtime");

        play_engine(app.handle().clone(), state.clone());
        std::thread::sleep(Duration::from_millis(80));
        runtime
            .block_on(stop_engine(app.handle(), &state))
            .expect("baseline stop");
        play_engine(app.handle().clone(), state.clone());
        std::thread::sleep(Duration::from_millis(80));
        state.scheduler.stop();
        std::thread::sleep(Duration::from_millis(100));

        let active_count =
            runtime.block_on(async { state.runtime.read().await.active_phasers.len() });
        assert_eq!(
            active_count, 0,
            "Stage 1 Pause must preserve and rebuild active clips"
        );
    }

    #[test]
    fn stop_then_reset_clears_outputs_and_returns_cursor_to_zero() {
        let app = tauri::test::mock_app();
        let state = engine_state();
        let runtime = Runtime::new().expect("test runtime");
        runtime.block_on(async {
            let mut current = state.runtime.write().await;
            current.global_beat = 4.0;
            current.is_playing = true;
        });

        runtime
            .block_on(stop_engine(app.handle(), &state))
            .expect("baseline stop");
        let stopped = runtime.block_on(async {
            let current = state.runtime.read().await;
            (
                current.is_playing,
                current.global_beat,
                current.active_phasers.len(),
            )
        });
        assert_eq!(stopped, (false, 4.0, 0));

        runtime
            .block_on(reset_beat_engine(&state))
            .expect("baseline reset");
        let reset_beat = runtime.block_on(async { state.runtime.read().await.global_beat });
        assert_eq!(reset_beat, 0.0);
    }
}
