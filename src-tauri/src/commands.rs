use tauri::{AppHandle, State};
use std::sync::Arc;
use crate::state::{EngineState, ActivePhaser};
use crate::compiler::parser::ShowDSL;
use crate::compiler::{Compiler, error::CompileError, LayoutCoord};

#[derive(serde::Serialize)]
pub struct CompileResult {
    pub success: bool,
    pub fixture_count: usize,
    pub layout_coords: Vec<LayoutCoord>,
    pub group_names: Vec<String>,
    pub phaser_names: Vec<String>,
    pub sequence_names: Vec<String>,
    pub errors: Vec<CompileError>,
    pub warnings: Vec<CompileError>,
}

#[tauri::command]
pub async fn load_dsl(dsl_json: String, state: State<'_, Arc<EngineState>>) -> Result<CompileResult, String> {
    let dsl: ShowDSL = serde_json::from_str(&dsl_json).map_err(|e| format!("JSON parsing error: {}", e))?;
    let compiled = Compiler::compile(dsl);
    
    let mut result = CompileResult {
        success: false,
        fixture_count: 0,
        layout_coords: vec![],
        group_names: vec![],
        phaser_names: vec![],
        sequence_names: vec![],
        errors: vec![],
        warnings: vec![],
    };

    match compiled {
        Ok(c) => {
            result.success = true;
            result.fixture_count = c.fixtures.len();
            result.layout_coords = c.coords.clone();
            result.group_names = c.groups.keys().cloned().collect();
            result.phaser_names = c.phasers.keys().cloned().collect();
            result.sequence_names = c.sequences.iter().map(|s| s.name.clone()).collect();
            
            let mut show_guard = state.compiled_show.write().await;
            
            // If in timeline mode, re-initialize timeline executor with new DSL
            let mut r_state = state.runtime.write().await;
            if r_state.sequencer_mode == crate::state::SequencerMode::Timeline {
                if let Some(timeline) = &c.timeline {
                    // Reset active phasers when timeline changes
                    r_state.active_phasers.clear();
                    r_state.timeline_executor = Some(crate::engine::timeline::TimelineExecutor::new(timeline.clone()));
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
pub async fn validate_dsl(dsl_json: String) -> Result<Vec<CompileError>, String> {
    let dsl: ShowDSL = serde_json::from_str(&dsl_json).map_err(|e| format!("JSON parsing error: {}", e))?;
    let compiled = Compiler::compile(dsl);
    match compiled {
        Ok(_) => Ok(vec![]),
        Err(e) => Ok(e)
    }
}

#[tauri::command]
pub async fn play(app_handle: AppHandle, state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    state.scheduler.start(app_handle, (*state).clone(), 8);
    Ok(())
}

#[tauri::command]
pub async fn stop(state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    state.scheduler.stop();
    let mut r_state = state.runtime.write().await;
    r_state.is_playing = false;
    Ok(())
}

#[tauri::command]
pub async fn set_tempo(bpm: u32, state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    state.scheduler.set_tempo(bpm);
    Ok(())
}

#[tauri::command]
pub async fn trigger_phaser(phaser_name: String, state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    let mut r_state = state.runtime.write().await;
    if !r_state.active_phasers.iter().any(|p| p.name == phaser_name) {
        let beat = r_state.global_beat;
        r_state.active_phasers.push(ActivePhaser { name: phaser_name, start_beat: beat, instance_id: None });
    }
    Ok(())
}

#[tauri::command]
pub async fn stop_phaser(phaser_name: String, state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    let mut r_state = state.runtime.write().await;
    r_state.active_phasers.retain(|p| p.name != phaser_name);
    Ok(())
}

#[tauri::command]
pub async fn trigger_cue(seq: String, cue_id: u32, state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    let mut r_state = state.runtime.write().await;
    r_state.current_cue = Some(crate::state::CueInfo {
        sequence: seq,
        cue_id,
        cue_name: None,
    });
    Ok(())
}

#[tauri::command]
pub async fn go_next_cue(_seq: String, _state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    // Basic impl for go next
    Ok(())
}

#[tauri::command]
pub async fn save_show(path: String, dsl_json: String) -> Result<(), String> {
    let _: ShowDSL = serde_json::from_str(&dsl_json)
        .map_err(|e| format!("JSON formatting error: {}", e))?;
    tokio::fs::write(&path, dsl_json.as_bytes()).await
        .map_err(|e| format!("File write error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn load_show(path: String) -> Result<String, String> {
    let content = tokio::fs::read_to_string(&path).await
        .map_err(|e| format!("File read error: {}", e))?;
    let _: ShowDSL = serde_json::from_str(&content)
        .map_err(|e| format!("DSL parse error: {}", e))?;
    Ok(content)
}

#[tauri::command]
pub async fn set_sequencer_mode(mode: String, state: State<'_, Arc<EngineState>>) -> Result<(), String> {
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
                r_state.timeline_executor = Some(crate::engine::timeline::TimelineExecutor::new(timeline.clone()));
            }
        }
    } else {
        r_state.timeline_executor = None;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn get_layout_coords(state: State<'_, Arc<EngineState>>) -> Result<Vec<LayoutCoord>, String> {
    let show = state.compiled_show.read().await;
    if let Some(s) = &*show {
        Ok(s.coords.clone())
    } else {
        Ok(vec![])
    }
}
