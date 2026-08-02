use crate::compiler::{diagnostic::Diagnostic, Compiler, LayoutCoord};
use crate::document::{load_document, MigrationReport, ShowDocumentV1};
use crate::engine::render::{LivePhaser, RenderTime};
use crate::engine::transport::OutputRate;
use crate::state::EngineState;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[derive(serde::Serialize, Clone)]
pub struct PhaserInfo {
    pub id: String,
    pub name: String,
}

#[derive(serde::Serialize)]
pub struct CompileResult {
    pub success: bool,
    pub show_revision: Option<u64>,
    pub fixture_count: usize,
    pub layout_coords: Vec<LayoutCoord>,
    pub group_names: Vec<String>,
    pub phasers: Vec<PhaserInfo>,
    pub sequence_names: Vec<String>,
    pub errors: Vec<Diagnostic>,
    pub warnings: Vec<Diagnostic>,
    pub migration_report: MigrationReport,
}

#[derive(serde::Serialize)]
pub struct LoadShowResult {
    pub document: ShowDocumentV1,
    pub migration_report: MigrationReport,
}

#[tauri::command]
pub async fn load_dsl(
    dsl_json: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<CompileResult, Diagnostic> {
    let loaded = load_document(&dsl_json)?;
    let dsl = loaded.document;
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
        show_revision: None,
        fixture_count: 0,
        layout_coords: vec![],
        group_names: vec![],
        phasers: vec![],
        sequence_names: vec![],
        errors: vec![],
        warnings: vec![],
        migration_report: loaded.migration_report,
    };

    match compiled {
        Ok(c) => {
            result.success = true;
            result.fixture_count = c.fixtures.len();
            result.layout_coords = c.coords.clone();
            result.group_names = group_names;
            result.phasers = phasers;

            let snapshot = state.shows.publish(c).await;
            result.show_revision = Some(snapshot.revision);

            // Reset active phasers when loading a new DSL (both live and timeline mode)
            let mut r_state = state.runtime.write().await;
            r_state.live_phasers.clear();
        }
        Err(e) => {
            result.errors = e;
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn validate_dsl(dsl_json: String) -> Result<Vec<Diagnostic>, Diagnostic> {
    let dsl = load_document(&dsl_json)?.document;
    let compiled = Compiler::compile(dsl);
    match compiled {
        Ok(_) => Ok(vec![]),
        Err(e) => Ok(e),
    }
}

#[tauri::command]
pub async fn play(app_handle: AppHandle, state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    state
        .scheduler
        .play(app_handle, state.inner().clone())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn pause(
    app_handle: AppHandle,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    state
        .scheduler
        .pause(&app_handle, state.inner())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn stop(app_handle: AppHandle, state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    state
        .scheduler
        .stop(&app_handle, state.inner())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn seek(
    beat: f64,
    app_handle: AppHandle,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    state
        .scheduler
        .seek(&app_handle, state.inner(), beat)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn set_tempo(
    bpm: u32,
    app_handle: AppHandle,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    state
        .scheduler
        .set_tempo(&app_handle, state.inner(), bpm)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn set_output_rate(hz: u32, state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    let output_rate = OutputRate::new(hz).map_err(|error| error.to_string())?;
    state
        .scheduler
        .set_output_rate(output_rate)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn trigger_phaser(
    phaser_id: String,
    multiplier: f64,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    let now = state.clock.now();
    let mut r_state = state.runtime.write().await;
    let beat = r_state.transport.snapshot(now).cursor_beat;
    if let Some(phaser) = r_state.live_phasers.iter_mut().find(|p| p.id == phaser_id) {
        phaser.phase_offset = phaser.phase_at(RenderTime { beat });
        phaser.start_beat = beat;
        phaser.multiplier = multiplier;
    } else {
        r_state.live_phasers.push(LivePhaser {
            id: phaser_id,
            start_beat: beat,
            phase_offset: 0.0,
            multiplier,
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
    r_state.live_phasers.retain(|p| p.id != phaser_id);
    Ok(())
}

#[tauri::command]
pub async fn save_show(path: String, dsl_json: String) -> Result<(), String> {
    let loaded = load_document(&dsl_json).map_err(|error| error.to_string())?;
    let serialized = serde_json::to_string_pretty(&loaded.document)
        .map_err(|error| format!("Document serialization error: {error}"))?;
    tokio::fs::write(&path, serialized.as_bytes())
        .await
        .map_err(|e| format!("File write error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn load_show(path: String) -> Result<LoadShowResult, String> {
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("File read error: {}", e))?;
    let loaded = load_document(&content).map_err(|error| error.to_string())?;
    Ok(LoadShowResult {
        document: loaded.document,
        migration_report: loaded.migration_report,
    })
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
    r_state.live_phasers.clear();

    Ok(())
}

#[tauri::command]
pub async fn get_layout_coords(
    state: State<'_, Arc<EngineState>>,
) -> Result<Vec<LayoutCoord>, String> {
    if let Some(snapshot) = state.shows.current().await {
        Ok(snapshot.show.coords.clone())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn request_full_frame(state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    state.runtime.write().await.frame_publisher.request_full();
    Ok(())
}
