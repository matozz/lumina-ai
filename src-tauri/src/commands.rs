use crate::compiler::diagnostic::{
    Diagnostic, PROJECT_REFERENCE_NOT_FOUND, PROJECT_SCHEMA_INVALID,
};
use crate::compiler::{CompiledProjectSnapshot, Compiler, LayoutCoord};
use crate::document::{
    builtin_production_catalog, layout_authoring_capacity, layout_fixture_size_for_fixture,
    layout_to_show_dsl, load_document, load_project_bundle, load_project_draft, resolve_cue_recipe,
    validate_effect_draft, validate_layout_geometry, validate_production_catalog, AssetRef,
    CueDefinition, CueRecipeRef, EffectDefinitionDocument, LayoutDefinition, LayoutGeometry,
    MetaDSL, PatchDSL, ProductionCatalog, ProjectBundle, ShowDocumentV1, StageDocument,
};
use crate::engine::attribute::FixtureFramePayload;
use crate::engine::effect::{
    is_beat_sync_speed_multiplier, EffectCatalog, EffectCatalogQuery, EffectSource,
    SPEED_PARAMETER_ID,
};
use crate::engine::render::{render_at, LivePhaser, RenderSource, RenderTime};
use crate::engine::temporal::{
    analyze_project_temporal_behavior, TemporalAnalysisRequest, TemporalFingerprintReport,
};
use crate::engine::transport::OutputRate;
use crate::state::{
    EngineState, LivePadQuantize, PreviewSession, PreviewSource, RenderContext,
    ScheduledLiveActionKind, ShowSnapshot,
};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, State};

static SAVE_SEQUENCE: AtomicU64 = AtomicU64::new(1);

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
}

#[derive(serde::Serialize)]
pub struct LoadShowResult {
    pub document: ShowDocumentV1,
}

#[derive(serde::Serialize)]
pub struct ShowSnapshotState {
    pub published_revision: Option<u64>,
    pub live_revision: Option<u64>,
}

#[derive(serde::Serialize)]
pub struct ProjectCompileResult {
    pub success: bool,
    pub show_revision: Option<u64>,
    pub project_ref: Option<AssetRef>,
    pub stage_ref: Option<AssetRef>,
    pub arrangement_ref: Option<AssetRef>,
    pub fixture_count: usize,
    pub layout_coords: Vec<LayoutCoord>,
    pub errors: Vec<Diagnostic>,
}

#[derive(serde::Serialize)]
pub struct ProjectPreviewFrame {
    pub generation: u64,
    pub source: PreviewSource,
    pub context: RenderContext,
    pub project_ref: AssetRef,
    pub stage_ref: AssetRef,
    pub arrangement_ref: AssetRef,
    pub playhead_tick: u64,
    pub layout_coords: Vec<LayoutCoord>,
    pub outputs: Vec<FixtureFramePayload>,
}

#[derive(serde::Serialize)]
pub struct LiveEffectInfo {
    pub instance_id: String,
    pub definition_id: String,
    pub definition_revision: u32,
    pub name: String,
    pub target_group_id: String,
}

#[derive(serde::Serialize)]
pub struct LiveEffectCatalog {
    pub show_revision: u64,
    pub effects: Vec<LiveEffectInfo>,
}

#[derive(serde::Serialize)]
pub struct QueuedLivePad {
    pub target_beat: f64,
}

#[derive(serde::Serialize)]
pub struct EffectCatalogInfo {
    pub id: String,
    pub name: String,
    pub revision: u32,
    pub source: EffectSource,
    pub catalog: EffectCatalog,
    pub target_supported: bool,
    pub missing_attributes: Vec<String>,
}

#[tauri::command]
pub async fn query_effect_catalog(
    target_group_id: String,
    query: EffectCatalogQuery,
    state: State<'_, Arc<EngineState>>,
) -> Result<Vec<EffectCatalogInfo>, String> {
    let snapshot = state
        .shows
        .latest_published()
        .await
        .ok_or_else(|| "No compiled show is loaded.".to_string())?;
    Ok(snapshot
        .show
        .query_effect_catalog(&target_group_id, &query)
        .into_iter()
        .map(|matched| EffectCatalogInfo {
            id: matched.definition.id.clone(),
            name: matched.definition.name.clone(),
            revision: matched.definition.revision,
            source: matched.definition.source,
            catalog: matched.definition.catalog.clone(),
            target_supported: matched.target_supported,
            missing_attributes: matched.missing_attributes,
        })
        .collect())
}

#[tauri::command]
pub fn get_production_catalog() -> Result<ProductionCatalog, Vec<Diagnostic>> {
    let catalog = builtin_production_catalog().map_err(|diagnostic| vec![diagnostic])?;
    let diagnostics = validate_production_catalog(&catalog);
    if diagnostics.is_empty() {
        Ok(catalog)
    } else {
        Err(diagnostics)
    }
}

#[tauri::command]
pub fn validate_effect_working_draft(
    effect: EffectDefinitionDocument,
) -> Result<EffectDefinitionDocument, Vec<Diagnostic>> {
    validate_effect_draft(effect)
}

#[tauri::command]
pub async fn analyze_effect_temporal(
    project_json: String,
    request: TemporalAnalysisRequest,
) -> Result<TemporalFingerprintReport, Vec<Diagnostic>> {
    let project = load_project_draft(&project_json)?;
    tokio::task::spawn_blocking(move || analyze_project_temporal_behavior(&project, &request))
        .await
        .map_err(|error| {
            vec![Diagnostic::error(
                PROJECT_SCHEMA_INVALID,
                "temporal.worker",
                format!("Temporal analysis worker failed: {error}"),
                "Retry after the current Effect preview compiles successfully.",
            )]
        })?
}

#[tauri::command]
pub fn validate_project_working_draft(
    project_json: String,
) -> Result<crate::document::ProjectBundle, Vec<Diagnostic>> {
    load_project_bundle(&project_json).map(|validated| validated.into_bundle())
}

#[tauri::command]
pub fn resolve_production_cue_recipe(
    project_json: String,
    recipe_ref: CueRecipeRef,
    stage_ref: AssetRef,
    cue_id: String,
    cue_revision: u32,
    cue_name: String,
) -> Result<CueDefinition, Vec<Diagnostic>> {
    let project = serde_json::from_str::<ProjectBundle>(&project_json).map_err(|error| {
        vec![Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            "project_bundle",
            error.to_string(),
            "Repair the active Stage or Layout data before opening this recipe.",
        )]
    })?;
    let catalog = get_production_catalog()?;
    resolve_cue_recipe(
        &catalog,
        &project,
        &recipe_ref,
        &stage_ref,
        cue_id,
        cue_revision,
        cue_name,
    )
}

#[tauri::command]
pub async fn load_dsl(
    dsl_json: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<CompileResult, Diagnostic> {
    let (mut result, compiled) = compile_dsl(&dsl_json)?;
    if let Some(compiled) = compiled {
        let snapshot = state.shows.publish_and_activate(compiled).await;
        result.show_revision = Some(snapshot.revision);
        state.runtime.write().await.live_phasers.clear();
    }
    Ok(result)
}

#[tauri::command]
pub async fn publish_dsl(
    dsl_json: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<CompileResult, Diagnostic> {
    let (mut result, compiled) = compile_dsl(&dsl_json)?;
    if let Some(compiled) = compiled {
        let snapshot = state.shows.publish(compiled).await;
        result.show_revision = Some(snapshot.revision);
    }
    Ok(result)
}

#[tauri::command]
pub fn preview_dsl(dsl_json: String) -> Result<CompileResult, Diagnostic> {
    let (result, _) = compile_dsl(&dsl_json)?;
    Ok(result)
}

#[tauri::command]
pub async fn preview_project(
    project_json: Option<String>,
    arrangement_ref: Option<AssetRef>,
    source: PreviewSource,
    context: RenderContext,
    playhead_tick: u64,
    state: State<'_, Arc<EngineState>>,
) -> Result<ProjectPreviewFrame, Vec<Diagnostic>> {
    let snapshot = match &source {
        PreviewSource::AuthoringDraft | PreviewSource::RehearsalDraft => {
            let project_json = project_json.ok_or_else(|| {
                vec![project_diagnostic(
                    "project_json",
                    "Draft preview requires the current Project bundle.",
                )]
            })?;
            let arrangement_ref = arrangement_ref.ok_or_else(|| {
                vec![project_diagnostic(
                    "arrangement_ref",
                    "Draft preview requires an exact Arrangement reference.",
                )]
            })?;
            Arc::new(compile_project_json(&project_json, &arrangement_ref)?)
        }
        PreviewSource::RehearsalPublished { revision } => state
            .shows
            .revision(*revision)
            .await
            .and_then(|snapshot| snapshot.project)
            .ok_or_else(|| {
                vec![project_diagnostic(
                    "source.revision",
                    format!(
                        "Published revision {revision} does not contain a Stage 7 Project snapshot."
                    ),
                )]
            })?,
    };
    let session = state
        .previews
        .replace(source, context, playhead_tick, snapshot)
        .await;
    render_preview_session(&session)
}

#[tauri::command]
pub async fn render_project_preview(
    context: RenderContext,
    playhead_tick: u64,
    state: State<'_, Arc<EngineState>>,
) -> Result<ProjectPreviewFrame, Vec<Diagnostic>> {
    let session = state
        .previews
        .update_context(context, playhead_tick)
        .await
        .ok_or_else(|| {
            vec![project_diagnostic(
                "preview_session",
                "No PreviewSession has been compiled.",
            )]
        })?;
    render_preview_session(&session)
}

#[tauri::command]
pub async fn publish_project(
    project_json: String,
    arrangement_ref: AssetRef,
    state: State<'_, Arc<EngineState>>,
) -> Result<ProjectCompileResult, String> {
    let validated = match load_project_bundle(&project_json) {
        Ok(validated) => validated,
        Err(errors) => return Ok(project_compile_failure(errors)),
    };
    let bundle = validated.bundle().clone();
    let compiled = match Compiler::compile_project(validated, &arrangement_ref) {
        Ok(compiled) => compiled,
        Err(errors) => return Ok(project_compile_failure(errors)),
    };
    let result = project_compile_success(&compiled, None);
    match state.shows.publish_project(compiled, &bundle).await {
        Ok(snapshot) => Ok(ProjectCompileResult {
            show_revision: Some(snapshot.revision),
            ..result
        }),
        Err(errors) => Ok(project_compile_failure(errors)),
    }
}

#[tauri::command]
pub async fn save_project(path: String, project_json: String) -> Result<(), String> {
    let validated = load_project_bundle(&project_json).map_err(|diagnostics| {
        diagnostics
            .into_iter()
            .map(|diagnostic| diagnostic.to_string())
            .collect::<Vec<_>>()
            .join("\n")
    })?;
    let serialized = serde_json::to_string_pretty(&validated.into_bundle())
        .map_err(|error| format!("Project serialization error: {error}"))?;
    atomic_write(Path::new(&path), serialized.as_bytes()).await
}

#[tauri::command]
pub async fn load_project(path: String) -> Result<ProjectBundle, String> {
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| format!("Project read error: {error}"))?;
    load_project_bundle(&content)
        .map(crate::document::ValidatedProject::into_bundle)
        .map_err(|diagnostics| {
            diagnostics
                .into_iter()
                .map(|diagnostic| diagnostic.to_string())
                .collect::<Vec<_>>()
                .join("\n")
        })
}

#[tauri::command]
pub async fn preview_effect_loop(
    dsl_json: String,
    instance_id: String,
    frame_count: usize,
) -> Result<Vec<Vec<FixtureFramePayload>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (result, compiled) = compile_dsl(&dsl_json).map_err(|error| error.to_string())?;
        let show = compiled.ok_or_else(|| {
            result
                .errors
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join("\n")
        })?;
        let instance = show
            .effect_instances
            .get(&instance_id)
            .ok_or_else(|| format!("Effect instance not found: {instance_id}"))?;
        let definition = show
            .effect_definitions
            .get(instance.definition.index())
            .ok_or_else(|| format!("Effect definition not found for instance: {instance_id}"))?;
        let multiplier = definition
            .parameter_handle(SPEED_PARAMETER_ID)
            .and_then(|handle| instance.resolve_parameter(definition, handle))
            .and_then(|value| value.as_scalar())
            .unwrap_or(1.0);
        let live = [LivePhaser {
            id: instance_id,
            start_beat: 0.0,
            phase_offset: 0.0,
            multiplier,
        }];
        let frame_count = frame_count.clamp(8, 128);
        Ok((0..frame_count)
            .map(|index| {
                let beat = index as f64 / frame_count as f64 * 4.0;
                render_at(&show, RenderTime { beat }, RenderSource::Live(&live))
                    .into_iter()
                    .map(|frame| frame.to_payload())
                    .collect()
            })
            .collect())
    })
    .await
    .map_err(|error| format!("Effect preview worker failed: {error}"))?
}

#[tauri::command]
pub async fn activate_show_revision(
    revision: u64,
    state: State<'_, Arc<EngineState>>,
) -> Result<ShowSnapshotState, String> {
    state.shows.activate(revision).await?;
    let mut runtime = state.runtime.write().await;
    runtime.live_phasers.clear();
    runtime.pending_live_actions.clear();
    drop(runtime);
    Ok(show_snapshot_state(state.inner()).await)
}

#[tauri::command]
pub async fn get_show_snapshot_state(
    state: State<'_, Arc<EngineState>>,
) -> Result<ShowSnapshotState, String> {
    Ok(show_snapshot_state(state.inner()).await)
}

fn compile_dsl(
    dsl_json: &str,
) -> Result<(CompileResult, Option<crate::compiler::CompiledShow>), Diagnostic> {
    let loaded = load_document(dsl_json)?;
    let dsl = loaded.document;
    let mut group_names: Vec<String> = Vec::new();
    for g in &dsl.groups {
        if !group_names.contains(&g.name) {
            group_names.push(g.name.clone());
        }
    }

    let mut phasers: Vec<PhaserInfo> = Vec::new();
    for instance in &dsl.effect_instances {
        if !phasers.iter().any(|info| info.id == instance.id) {
            let name = dsl
                .effect_definitions
                .iter()
                .find(|definition| definition.id == instance.definition_id)
                .map_or_else(|| instance.id.clone(), |definition| definition.name.clone());
            phasers.push(PhaserInfo {
                id: instance.id.clone(),
                name,
            });
        }
    }

    let compiled = Compiler::compile_document(dsl);

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
    };

    let compiled = match compiled {
        Ok(c) => {
            result.success = true;
            result.fixture_count = c.fixtures.len();
            result.layout_coords = c.coords.clone();
            result.group_names = group_names;
            result.phasers = phasers;

            Some(c)
        }
        Err(e) => {
            result.errors = e;
            None
        }
    };

    Ok((result, compiled))
}

async fn show_snapshot_state(state: &EngineState) -> ShowSnapshotState {
    let (published_revision, live_revision) = state.shows.revisions().await;
    ShowSnapshotState {
        published_revision,
        live_revision,
    }
}

#[tauri::command]
pub async fn validate_dsl(dsl_json: String) -> Result<Vec<Diagnostic>, Diagnostic> {
    let dsl = load_document(&dsl_json)?.document;
    let compiled = Compiler::compile_document(dsl);
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
        .map_err(|error| error.to_string())?;
    state.runtime.write().await.output_rate_hz = output_rate.hz();
    Ok(())
}

#[tauri::command]
pub async fn get_live_effects(
    state: State<'_, Arc<EngineState>>,
) -> Result<LiveEffectCatalog, String> {
    let snapshot = state
        .shows
        .current()
        .await
        .ok_or_else(|| "No Live Snapshot is active.".to_string())?;
    Ok(live_effect_catalog(&snapshot))
}

fn live_effect_catalog(snapshot: &ShowSnapshot) -> LiveEffectCatalog {
    let mut effects: Vec<_> = snapshot
        .show
        .effect_instances
        .values()
        .filter(|instance| is_live_catalog_instance(&instance.id))
        .filter_map(|instance| {
            let definition = snapshot
                .show
                .effect_definitions
                .get(instance.definition.index())?;
            Some(LiveEffectInfo {
                instance_id: instance.id.clone(),
                definition_id: definition.id.clone(),
                definition_revision: definition.revision,
                name: definition.name.clone(),
                target_group_id: instance.target_group_id.clone(),
            })
        })
        .collect();
    effects.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then(left.instance_id.cmp(&right.instance_id))
    });
    LiveEffectCatalog {
        show_revision: snapshot.revision,
        effects,
    }
}

fn is_live_catalog_instance(instance_id: &str) -> bool {
    !instance_id.starts_with("__effect_preview__") && !instance_id.starts_with("__cue__:")
}

#[tauri::command]
pub async fn queue_live_pad(
    effect_id: String,
    action: String,
    quantize: String,
    multiplier: f64,
    exclusive_ids: Vec<String>,
    one_shot_beats: Option<f64>,
    state: State<'_, Arc<EngineState>>,
) -> Result<QueuedLivePad, String> {
    if !is_beat_sync_speed_multiplier(multiplier) {
        return Err("Live Pad speed must be 0.25, 0.5, 1, 2, 4, or 8×.".to_string());
    }
    if one_shot_beats
        .is_some_and(|duration| !duration.is_finite() || !(0.25..=256.0).contains(&duration))
    {
        return Err("One-shot duration must be between 0.25 and 256 beats.".to_string());
    }

    let live = state
        .shows
        .current()
        .await
        .ok_or_else(|| "No Live Snapshot is active.".to_string())?;
    if !live.show.effect_instances.contains_key(&effect_id) {
        return Err(format!(
            "Effect {effect_id:?} is not part of Live revision {}.",
            live.revision
        ));
    }
    let exclusive_ids = exclusive_ids
        .into_iter()
        .filter(|id| id != &effect_id && live.show.effect_instances.contains_key(id))
        .collect();
    let kind = match action.as_str() {
        "start" => ScheduledLiveActionKind::Start {
            multiplier,
            exclusive_ids,
        },
        "stop" => ScheduledLiveActionKind::Stop,
        _ => return Err("Live Pad action must be start or stop.".to_string()),
    };
    let quantize = match quantize.as_str() {
        "off" => LivePadQuantize::Off,
        "beat" => LivePadQuantize::Beat,
        "bar" => LivePadQuantize::Bar,
        _ => return Err("Live Pad quantize must be off, beat, or bar.".to_string()),
    };

    let now = state.clock.now();
    let mut runtime = state.runtime.write().await;
    let transport = runtime.transport.snapshot(now);
    if transport.state != crate::engine::transport::TransportState::Playing {
        return Err("Start or resume Transport before triggering a Live Pad.".to_string());
    }
    let target_beat = runtime.queue_live_pad(
        effect_id,
        kind,
        quantize,
        transport.cursor_beat,
        if action == "start" {
            one_shot_beats
        } else {
            None
        },
    );
    Ok(QueuedLivePad { target_beat })
}

#[tauri::command]
pub async fn set_blackout(
    enabled: bool,
    app_handle: AppHandle,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    state
        .scheduler
        .set_blackout(&app_handle, state.inner(), enabled)
        .await;
    Ok(())
}

#[tauri::command]
pub async fn trigger_phaser(
    phaser_id: String,
    multiplier: f64,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    if !is_beat_sync_speed_multiplier(multiplier) {
        return Err("Phaser speed must be 0.25, 0.5, 1, 2, 4, or 8×.".to_string());
    }
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
    atomic_write(Path::new(&path), serialized.as_bytes()).await?;
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
    r_state.pending_live_actions.clear();

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
pub fn preview_layout(
    layout: LayoutDefinition,
    stage: StageDocument,
) -> Result<Vec<LayoutCoord>, Vec<Diagnostic>> {
    validate_layout_geometry(&layout).map_err(|message| {
        vec![Diagnostic::error(
            PROJECT_SCHEMA_INVALID,
            "layout.geometry",
            message,
            "Enter valid integer fixture size and gap values, then retry this Layout Draft preview.",
        )]
    })?;
    let stage_fixture_ids: Vec<_> = stage
        .patch
        .iter()
        .flat_map(|item| item.id_range.0..=item.id_range.1)
        .collect();
    let capacity = layout_authoring_capacity(&layout);
    let first_id = stage_fixture_ids.iter().min().copied().unwrap_or(1);
    let preview_fixture_ids = match &layout.geometry {
        LayoutGeometry::Custom { fixtures, .. } => fixtures
            .iter()
            .map(|fixture| fixture.id)
            .collect::<Vec<_>>(),
        _ => (0..capacity)
            .map(|index| {
                let offset = u32::try_from(index).map_err(|_| {
                    vec![Diagnostic::error(
                        PROJECT_SCHEMA_INVALID,
                        "layout.geometry",
                        "Layout preview capacity exceeds the supported fixture ID range.",
                        "Reduce the Layout position count and retry preview.",
                    )]
                })?;
                first_id.checked_add(offset).ok_or_else(|| {
                    vec![Diagnostic::error(
                        PROJECT_SCHEMA_INVALID,
                        "layout.geometry",
                        "Layout preview fixture IDs overflow the supported range.",
                        "Use a lower fixture ID range or reduce the Layout position count.",
                    )]
                })
            })
            .collect::<Result<Vec<_>, _>>()?,
    };
    let preview_patch = preview_patch_for_fixture_ids(
        &preview_fixture_ids,
        stage
            .patch
            .first()
            .map(|item| item.profile_id.as_str())
            .unwrap_or("generic-rgb"),
    );
    let document = ShowDocumentV1 {
        schema_version: 1,
        meta: MetaDSL {
            name: format!("{} · Layout Draft", layout.name),
        },
        patch: preview_patch,
        layout: layout_to_show_dsl(&layout, &preview_fixture_ids),
        groups: Vec::new(),
        effect_definitions: Vec::new(),
        effect_instances: Vec::new(),
        timeline: None,
    };
    let mut show = Compiler::compile_document(document)?;
    for coord in &mut show.coords {
        let fixture_size = layout_fixture_size_for_fixture(&layout, coord.id);
        coord.width = Some(fixture_size.width);
        coord.height = Some(fixture_size.height);
        coord.patched = Some(true);
    }
    Ok(show.coords)
}

fn preview_patch_for_fixture_ids(fixture_ids: &[u32], profile_id: &str) -> Vec<PatchDSL> {
    let mut sorted = fixture_ids.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    let mut patch: Vec<PatchDSL> = Vec::new();
    for fixture_id in sorted {
        if let Some(previous) = patch.last_mut() {
            if previous.id_range.1.checked_add(1) == Some(fixture_id) {
                previous.id_range.1 = fixture_id;
                continue;
            }
        }
        patch.push(PatchDSL {
            profile_id: profile_id.to_string(),
            id_range: (fixture_id, fixture_id),
        });
    }
    patch
}

#[tauri::command]
pub async fn request_full_frame(state: State<'_, Arc<EngineState>>) -> Result<(), String> {
    state
        .runtime
        .write()
        .await
        .output_hub
        .request_preview_full()
        .map_err(|error| error.to_string())
}

fn compile_project_json(
    project_json: &str,
    arrangement_ref: &AssetRef,
) -> Result<CompiledProjectSnapshot, Vec<Diagnostic>> {
    let validated = load_project_bundle(project_json)?;
    Compiler::compile_project(validated, arrangement_ref)
}

fn project_compile_success(
    project: &CompiledProjectSnapshot,
    show_revision: Option<u64>,
) -> ProjectCompileResult {
    ProjectCompileResult {
        success: true,
        show_revision,
        project_ref: Some(project.project_ref.clone()),
        stage_ref: Some(project.stage_ref.clone()),
        arrangement_ref: Some(project.arrangement_ref.clone()),
        fixture_count: project.show.fixtures.len(),
        layout_coords: project.show.coords.clone(),
        errors: Vec::new(),
    }
}

fn project_compile_failure(errors: Vec<Diagnostic>) -> ProjectCompileResult {
    ProjectCompileResult {
        success: false,
        show_revision: None,
        project_ref: None,
        stage_ref: None,
        arrangement_ref: None,
        fixture_count: 0,
        layout_coords: Vec::new(),
        errors,
    }
}

fn render_preview_session(
    session: &PreviewSession,
) -> Result<ProjectPreviewFrame, Vec<Diagnostic>> {
    let show = &session.snapshot.show;
    let beat = session.playhead_tick as f64
        / f64::from(show.timeline.as_ref().map_or(960, |timeline| timeline.ppq));
    let mut live_phasers = Vec::new();
    let source = match &session.context {
        RenderContext::Stage => RenderSource::Live(&live_phasers),
        RenderContext::Arrangement => RenderSource::Timeline,
        RenderContext::Effect {
            effect_ref,
            target_set_id,
        } => {
            let instance = session
                .snapshot
                .effect_previews
                .get(&(effect_ref.clone(), target_set_id.clone()))
                .ok_or_else(|| {
                    vec![project_diagnostic(
                        "context.effect_ref",
                        format!(
                            "Effect {:?} revision {} cannot preview TargetSet {:?}.",
                            effect_ref.id, effect_ref.revision, target_set_id
                        ),
                    )]
                })?;
            live_phasers.push(LivePhaser {
                id: instance.as_str().to_string(),
                start_beat: 0.0,
                phase_offset: 0.0,
                multiplier: preview_instance_speed(show, instance.as_str()),
            });
            RenderSource::Live(&live_phasers)
        }
        RenderContext::Cue { cue_ref } => {
            let cue = session.snapshot.cues.get(cue_ref).ok_or_else(|| {
                vec![project_diagnostic(
                    "context.cue_ref",
                    format!(
                        "Cue {:?} revision {} is not part of the compiled Project closure.",
                        cue_ref.id, cue_ref.revision
                    ),
                )]
            })?;
            live_phasers.extend(cue.layers.iter().map(|layer| LivePhaser {
                id: layer.instance.as_str().to_string(),
                start_beat: 0.0,
                phase_offset: 0.0,
                multiplier: preview_instance_speed(show, layer.instance.as_str()),
            }));
            RenderSource::Live(&live_phasers)
        }
    };
    let outputs = render_at(show, RenderTime { beat }, source)
        .into_iter()
        .map(|frame| frame.to_payload())
        .collect();
    Ok(ProjectPreviewFrame {
        generation: session.generation,
        source: session.source.clone(),
        context: session.context.clone(),
        project_ref: session.snapshot.project_ref.clone(),
        stage_ref: session.snapshot.stage_ref.clone(),
        arrangement_ref: session.snapshot.arrangement_ref.clone(),
        playhead_tick: session.playhead_tick,
        layout_coords: show.coords.clone(),
        outputs,
    })
}

fn preview_instance_speed(show: &crate::compiler::CompiledShow, instance_id: &str) -> f64 {
    show.effect_instances
        .get(instance_id)
        .and_then(|instance| {
            let definition = show.effect_definitions.get(instance.definition.index())?;
            let handle = definition.parameter_handle(SPEED_PARAMETER_ID)?;
            instance
                .resolve_parameter(definition, handle)
                .and_then(|value| value.as_scalar())
        })
        .unwrap_or(1.0)
}

fn project_diagnostic(path: impl Into<String>, message: impl Into<String>) -> Diagnostic {
    Diagnostic::error(
        PROJECT_REFERENCE_NOT_FOUND,
        path,
        message,
        "Rebuild the PreviewSession from a valid exact Project revision graph.",
    )
}

async fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Show path must end with a valid UTF-8 file name.".to_string())?;
    let sequence = SAVE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temporary_path: PathBuf = parent.join(format!(
        ".{file_name}.lumina-{}-{sequence}.tmp",
        std::process::id()
    ));

    tokio::fs::write(&temporary_path, contents)
        .await
        .map_err(|error| format!("Temporary show write error: {error}"))?;
    if let Err(error) = tokio::fs::rename(&temporary_path, path).await {
        let _ = tokio::fs::remove_file(&temporary_path).await;
        return Err(format!("Atomic show replace error: {error}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        atomic_write, compile_dsl, is_live_catalog_instance, live_effect_catalog, load_project,
        preview_dsl, preview_effect_loop, preview_instance_speed, preview_layout,
        resolve_production_cue_recipe, save_project, SAVE_SEQUENCE,
    };
    use crate::document::{
        load_project_bundle, valid_bundle, AssetRef, CueRecipeRef, LayoutFixtureSizeOverride,
        LayoutGeometry, LayoutSize, TempoPointDSL,
    };
    use crate::state::ShowSnapshot;
    use std::sync::atomic::Ordering;
    use std::sync::Arc;

    #[tokio::test]
    async fn atomically_replaces_a_show_without_leaving_temporary_files() {
        let sequence = SAVE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let directory = std::env::temp_dir().join(format!(
            "lumina-atomic-save-{}-{sequence}",
            std::process::id()
        ));
        tokio::fs::create_dir(&directory)
            .await
            .expect("test directory");
        let show_path = directory.join("show.json");
        tokio::fs::write(&show_path, b"old")
            .await
            .expect("initial show");

        atomic_write(&show_path, b"new")
            .await
            .expect("atomic replacement");

        assert_eq!(
            tokio::fs::read_to_string(&show_path)
                .await
                .expect("saved show"),
            "new"
        );
        let mut entries = tokio::fs::read_dir(&directory)
            .await
            .expect("test directory");
        let mut entry_count = 0;
        while entries
            .next_entry()
            .await
            .expect("directory entry")
            .is_some()
        {
            entry_count += 1;
        }
        assert_eq!(entry_count, 1);
        tokio::fs::remove_dir_all(directory)
            .await
            .expect("test cleanup");
    }

    #[tokio::test]
    async fn saves_and_reopens_multiple_arrangements_without_moving_ticks() {
        let sequence = SAVE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let directory = std::env::temp_dir().join(format!(
            "lumina-project-save-{}-{sequence}",
            std::process::id()
        ));
        tokio::fs::create_dir(&directory)
            .await
            .expect("test directory");
        let project_path = directory.join("project.lumina.json");
        let mut bundle = valid_bundle();
        bundle.layouts[0].name = "Saved Matrix Layout".to_string();
        bundle.stages[0].target_sets[0].name = "Saved All Target".to_string();
        let expected_layout_ref = bundle.stages[0].layout_ref.clone();
        let mut journey = bundle.arrangements[0].clone();
        journey.id = "tempo-journey".to_string();
        journey.name = "Tempo Journey".to_string();
        journey.tempo_map.points.push(TempoPointDSL {
            time_tick: 7_680,
            bpm: 96.0,
        });
        let expected_clip_tick = journey.tracks[0].clips[0].start_tick;
        bundle.manifest.arrangement_refs.push(AssetRef {
            id: journey.id.clone(),
            revision: journey.revision,
        });
        bundle.manifest.active_arrangement_id = journey.id.clone();
        bundle.arrangements.push(journey);

        save_project(
            project_path.to_string_lossy().into_owned(),
            serde_json::to_string(&bundle).expect("serialize Project"),
        )
        .await
        .expect("save Project");
        let reopened = load_project(project_path.to_string_lossy().into_owned())
            .await
            .expect("reopen Project");

        assert_eq!(reopened.arrangements.len(), 2);
        assert_eq!(reopened.layouts[0].name, "Saved Matrix Layout");
        assert_eq!(reopened.stages[0].layout_ref, expected_layout_ref);
        assert_eq!(reopened.stages[0].target_sets[0].name, "Saved All Target");
        assert_eq!(reopened.manifest.active_arrangement_id, "tempo-journey");
        assert_eq!(reopened.arrangements[1].tempo_map.points.len(), 2);
        assert_eq!(
            reopened.arrangements[1].tracks[0].clips[0].start_tick,
            expected_clip_tick
        );
        tokio::fs::remove_dir_all(directory)
            .await
            .expect("test cleanup");
    }

    #[test]
    fn live_catalog_excludes_authoring_preview_instances() {
        assert!(is_live_catalog_instance("__arr__:house-128:clip-1:layer-1"));
        assert!(!is_live_catalog_instance("__effect_preview__:pulse-r1:all"));
        assert!(!is_live_catalog_instance("__cue__:pulse-gradient:layer-1"));
    }

    #[test]
    fn recipe_resolution_ignores_unrelated_invalid_cues() {
        let mut bundle = valid_bundle();
        let mut conflicting_layer = bundle.cues[0].layers[0].clone();
        conflicting_layer.id = "unrelated-conflict".to_string();
        bundle.cues[0].layers.push(conflicting_layer);
        let source = serde_json::to_string(&bundle).expect("serialize Project");
        assert!(load_project_bundle(&source).is_err());

        let stage_ref = bundle.manifest.stage_ref.clone();
        let cue = resolve_production_cue_recipe(
            source,
            CueRecipeRef {
                id: "recipe.four-on-floor".to_string(),
                revision: 1,
            },
            stage_ref.clone(),
            "resolved-pulse".to_string(),
            1,
            "Resolved Pulse".to_string(),
        )
        .expect("unrelated Cue diagnostics must not block a new recipe draft");

        assert_eq!(cue.compatible_stage_ref, stage_ref);
        assert_eq!(cue.layers.len(), 1);
        assert_eq!(cue.layers[0].target_set_ref.target_set_id, "all");
    }

    #[test]
    fn authoring_preview_uses_the_cue_speed_override() {
        let mut bundle = valid_bundle();
        let catalog = crate::document::builtin_production_catalog().expect("catalog");
        let traveler = catalog
            .effects
            .iter()
            .find(|effect| effect.id == "builtin.intensity.wave")
            .expect("traveler")
            .clone();
        let reference = AssetRef {
            id: traveler.id.clone(),
            revision: traveler.revision,
        };
        bundle.effects = vec![traveler];
        bundle.manifest.effect_refs = vec![reference.clone()];
        bundle.cues[0].layers[0].effect_ref = reference;
        bundle.cues[0].risk_summary =
            serde_json::from_value(serde_json::json!({ "strobe_risk": "none" }))
                .expect("traveler risk summary");
        bundle.cues[0].layers[0].parameter_overrides.insert(
            "speed".to_string(),
            serde_json::from_value(serde_json::json!({ "type": "scalar", "value": 2.0 }))
                .expect("speed override"),
        );
        let source = serde_json::to_string(&bundle).expect("serialize Project");
        let snapshot = crate::compiler::Compiler::compile_active_project(
            load_project_bundle(&source).expect("Project validates"),
        )
        .expect("Project compiles");
        let cue = snapshot
            .cues
            .get(&bundle.manifest.cue_refs[0])
            .expect("compiled Cue");
        let instance_id = cue.layers[0].instance.as_str();

        assert_eq!(preview_instance_speed(&snapshot.show, instance_id), 2.0);
    }

    #[test]
    fn draft_preview_compiles_without_assigning_a_show_revision() {
        let source = r#"{
          "schema_version": 1,
          "meta": { "name": "Preview" },
          "patch": [{ "profile_id": "generic-rgb", "id_range": [1, 4] }],
          "layout": { "type": "generator", "generator": { "shape": "matrix", "rows": 2, "columns": 2, "spacing": 64 } },
          "groups": [{ "id": "all", "name": "All", "fixtures": { "range": [1, 4] } }],
          "effect_definitions": [],
          "effect_instances": [],
          "timeline": { "ppq": 960, "tempo_map": { "points": [{ "time_tick": 0, "bpm": 120 }] }, "tracks": [] }
        }"#;

        let result = preview_dsl(source.to_string()).expect("draft preview");
        assert!(result.success);
        assert_eq!(result.show_revision, None);
        assert_eq!(result.fixture_count, 4);
        assert_eq!(result.layout_coords.len(), 4);
    }

    #[test]
    fn layout_draft_preview_is_independent_from_stage_patch_capacity() {
        let mut bundle = valid_bundle();
        let layout = &mut bundle.layouts[0];
        let LayoutGeometry::Matrix { rows, columns, .. } = &mut layout.geometry else {
            panic!("matrix fixture");
        };
        *rows = 1;
        *columns = 2;
        layout
            .fixture_size_overrides
            .push(LayoutFixtureSizeOverride {
                fixture_id: 1,
                size: LayoutSize {
                    width: 24.0,
                    height: 10.0,
                },
            });

        let coords = preview_layout(layout.clone(), bundle.stages[0].clone())
            .expect("smaller Layout still previews");
        assert_eq!(coords.len(), 2);
        assert_eq!(coords[0].width, Some(24.0));
        assert_eq!(coords[0].height, Some(10.0));
        assert!(coords
            .iter()
            .all(|coord| coord.width.is_some_and(|width| width > 0.0)));
        assert!(coords
            .iter()
            .all(|coord| coord.height.is_some_and(|height| height > 0.0)));
    }

    #[test]
    fn layout_draft_preview_materializes_every_layout_position() {
        let mut bundle = valid_bundle();
        let layout = &mut bundle.layouts[0];
        let LayoutGeometry::Matrix { rows, columns, .. } = &mut layout.geometry else {
            panic!("matrix fixture");
        };
        *rows = 5;
        *columns = 4;

        let coords = preview_layout(layout.clone(), bundle.stages[0].clone())
            .expect("larger Layout previews unpatched positions");
        assert_eq!(coords.len(), 20);
        assert_eq!(
            coords
                .iter()
                .filter(|coord| coord.patched == Some(true))
                .count(),
            20
        );
        assert_eq!(
            coords
                .iter()
                .filter(|coord| coord.patched == Some(false))
                .count(),
            0
        );
    }

    #[test]
    fn circle_authoring_preview_keeps_fixture_count_and_fixed_ring_gap_independent() {
        let mut bundle = valid_bundle();
        let layout = &mut bundle.layouts[0];
        layout.geometry = LayoutGeometry::Circle {
            rings: 3,
            increment: 14,
            fixture_size: LayoutSize {
                width: 12.0,
                height: 12.0,
            },
            ring_gap: 10.0,
            ring_pitch: 22.0,
            center: crate::document::LayoutPoint { x: 0.0, y: 0.0 },
        };

        let coords = preview_layout(layout.clone(), bundle.stages[0].clone())
            .expect("dense Circle previews safely");
        assert_eq!(coords.len(), 85);
        let radii: std::collections::BTreeSet<_> = coords
            .iter()
            .map(|coord| (coord.x.hypot(coord.y)).round() as i64)
            .collect();
        assert_eq!(radii, [0, 22, 44, 66].into_iter().collect());
    }

    #[test]
    fn formula_and_algorithm_authoring_previews_materialize_every_position() {
        let bundle = valid_bundle();
        let catalog = crate::document::builtin_production_catalog().expect("catalog");
        for layout_id in [
            "builtin.layout.formula-sine-50",
            "builtin.layout.formula-arch-40",
            "builtin.layout.algorithm-lissajous-240",
            "builtin.layout.algorithm-spiral-420",
        ] {
            let layout = catalog
                .layouts
                .iter()
                .find(|layout| layout.id == layout_id)
                .unwrap_or_else(|| panic!("missing {layout_id}"));
            let coords = preview_layout(layout.clone(), bundle.stages[0].clone())
                .unwrap_or_else(|diagnostics| panic!("{layout_id}: {diagnostics:?}"));
            assert_eq!(
                coords.len(),
                crate::document::layout_authoring_capacity(layout),
                "{layout_id}"
            );
            assert!(
                coords
                    .iter()
                    .all(|coord| coord.x.is_finite() && coord.y.is_finite()),
                "{layout_id}"
            );
        }
    }

    #[tokio::test]
    async fn effect_loop_preview_renders_without_publishing() {
        let source = r##"{
          "schema_version": 1,
          "meta": { "name": "Preview" },
          "patch": [{ "profile_id": "generic-rgb", "id_range": [1, 1] }],
          "layout": { "type": "generator", "generator": { "shape": "matrix", "rows": 1, "columns": 1, "spacing": 64 } },
          "groups": [{ "id": "all", "name": "All", "fixtures": { "range": [1, 1] } }],
          "effect_definitions": [{
            "id": "project.red-pulse", "name": "Red Pulse", "revision": 1, "source": "project_local",
            "tempo": {
              "kind": "pulse", "primary_event": "pulse_onset",
              "events_per_graph_cycle": 1.0, "one_x_events_per_beat": 1.0,
              "phase_anchor": "onset", "duty_cycle": 0.5,
              "recommended_speed": { "min": 0.25, "max": 8.0 }
            },
            "parameters": [
              { "id": "speed", "name": "Speed", "schema": { "type": "scalar", "default": 1.0, "range": { "min": 0.25, "max": 8.0, "step": 0.25 }, "unit": "multiplier" }, "scope": "arrangement", "section": "main", "help": "Beat-synced playback speed." },
              { "id": "phase", "name": "Phase", "schema": { "type": "scalar", "default": 0.0, "range": { "min": -1.0, "max": 1.0, "step": 0.05 }, "unit": "cycles" }, "scope": "arrangement", "section": "main", "help": "Cycle offset." },
              { "id": "width", "name": "Width", "schema": { "type": "scalar", "default": 100.0, "range": { "min": 1.0, "max": 100.0, "step": 1.0 }, "unit": "percent" }, "scope": "arrangement", "section": "main", "help": "Pulse width." },
              { "id": "transition", "name": "Transition", "schema": { "type": "scalar", "default": 20.0, "range": { "min": 0.0, "max": 100.0, "step": 1.0 }, "unit": "percent" }, "scope": "arrangement", "section": "main", "help": "Pulse transition." },
              { "id": "color", "name": "Color", "schema": { "type": "color", "default": "#ff0000" }, "scope": "arrangement", "section": "main", "help": "Pulse color." }
            ],
            "graph": { "nodes": [
              { "type": "time", "id": "time" },
              { "type": "step_sequence", "id": "shape-pulse", "phase": { "node_id": "time", "port": "scalar" }, "steps": [
                { "values": { "dimmer": 1.0, "color": "#ff0000" }, "width": 50.0, "transition": 0.0 },
                { "values": { "dimmer": 0.0, "color": "#ff0000" }, "width": 50.0, "transition": 0.0 }
              ] },
              { "type": "attribute_writer", "id": "output", "input": { "node_id": "shape-pulse", "port": "attribute_set" } }
            ] },
            "catalog": { "energy": 0.7, "density": 0.5, "motion": "pulse", "colorfulness": 1.0, "strobe_risk": "low", "required_attributes": ["intensity", "color.rgb"] }
          }],
          "effect_instances": [{ "id": "red-pulse", "definition_id": "project.red-pulse", "definition_revision": 1, "target_group_id": "all", "seed": "0000000000000001" }],
          "timeline": { "ppq": 960, "tempo_map": { "points": [{ "time_tick": 0, "bpm": 120 }] }, "tracks": [] }
        }"##;

        let (_, compiled) = compile_dsl(source).expect("compile live catalog");
        let catalog = live_effect_catalog(&ShowSnapshot {
            revision: 7,
            show: Arc::new(compiled.expect("compiled show")),
            project: None,
        });
        assert_eq!(catalog.show_revision, 7);
        assert_eq!(catalog.effects.len(), 1);
        assert_eq!(catalog.effects[0].instance_id, "red-pulse");
        assert_eq!(catalog.effects[0].name, "Red Pulse");
        assert_eq!(catalog.effects[0].definition_revision, 1);

        let frames = preview_effect_loop(source.to_string(), "red-pulse".to_string(), 16)
            .await
            .expect("effect preview");
        assert_eq!(frames.len(), 16);
        assert!(frames.iter().all(|frame| frame.len() == 1));
        let intensities: Vec<_> = frames
            .iter()
            .filter_map(|frame| {
                frame[0]
                    .attributes
                    .iter()
                    .find(|attribute| attribute.id == "intensity")
                    .map(|attribute| attribute.value.clone())
            })
            .collect();
        assert!(intensities.windows(2).any(|pair| pair[0] != pair[1]));
    }
}
