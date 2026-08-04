use crate::compiler::diagnostic::{Diagnostic, PROJECT_REFERENCE_NOT_FOUND};
use crate::compiler::{CompiledProjectSnapshot, Compiler, LayoutCoord};
use crate::document::{
    load_document, load_project_bundle, migrate_project_bundle, AssetRef, MigrationReport,
    ShowDocumentV4,
};
use crate::engine::attribute::FixtureFramePayload;
use crate::engine::effect::{EffectCatalog, EffectCatalogQuery, EffectSource, SPEED_PARAMETER_ID};
use crate::engine::render::{render_at, LivePhaser, RenderSource, RenderTime};
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
    pub migration_report: MigrationReport,
}

#[derive(serde::Serialize)]
pub struct LoadShowResult {
    pub document: ShowDocumentV4,
    pub migration_report: MigrationReport,
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
pub async fn load_project(path: String) -> Result<crate::document::MigratedProject, String> {
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| format!("Project read error: {error}"))?;
    migrate_project_bundle(&content).map_err(|diagnostics| {
        diagnostics
            .into_iter()
            .map(|diagnostic| diagnostic.to_string())
            .collect::<Vec<_>>()
            .join("\n")
    })
}

#[tauri::command]
pub fn migrate_show_project(
    dsl_json: String,
) -> Result<crate::document::MigratedProject, Vec<Diagnostic>> {
    crate::document::migrate_show_to_project(&dsl_json)
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
        migration_report: loaded.migration_report,
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
    if !multiplier.is_finite() || !(0.125..=8.0).contains(&multiplier) {
        return Err("Live Pad multiplier must be between 0.125 and 8.".to_string());
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
                multiplier: 1.0,
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
                multiplier: 1.0,
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
        preview_dsl, preview_effect_loop, save_project, SAVE_SEQUENCE,
    };
    use crate::document::{valid_bundle, AssetRef, TempoPointDSL};
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

        assert_eq!(reopened.bundle.arrangements.len(), 2);
        assert_eq!(reopened.bundle.layouts[0].name, "Saved Matrix Layout");
        assert_eq!(reopened.bundle.stages[0].layout_ref, expected_layout_ref);
        assert_eq!(
            reopened.bundle.stages[0].target_sets[0].name,
            "Saved All Target"
        );
        assert_eq!(
            reopened.bundle.manifest.active_arrangement_id,
            "tempo-journey"
        );
        assert_eq!(reopened.bundle.arrangements[1].tempo_map.points.len(), 2);
        assert_eq!(
            reopened.bundle.arrangements[1].tracks[0].clips[0].start_tick,
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
    fn draft_preview_compiles_without_assigning_a_show_revision() {
        let source = r#"{
          "schema_version": 4,
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

    #[tokio::test]
    async fn effect_loop_preview_renders_without_publishing() {
        let source = r##"{
          "schema_version": 4,
          "meta": { "name": "Preview" },
          "patch": [{ "profile_id": "generic-rgb", "id_range": [1, 1] }],
          "layout": { "type": "generator", "generator": { "shape": "matrix", "rows": 1, "columns": 1, "spacing": 64 } },
          "groups": [{ "id": "all", "name": "All", "fixtures": { "range": [1, 1] } }],
          "effect_definitions": [{
            "id": "project.red-pulse", "name": "Red Pulse", "revision": 1, "source": "project_local",
            "parameters": [
              { "id": "speed", "name": "Speed", "value_type": "scalar", "default_value": { "type": "scalar", "value": 1.0 }, "range": [0.125, 8.0], "unit": "multiplier", "ui_hint": "slider", "automation": "continuous" },
              { "id": "phase", "name": "Phase", "value_type": "scalar", "default_value": { "type": "scalar", "value": 0.0 }, "range": [-1.0, 1.0], "unit": "cycles", "ui_hint": "slider", "automation": "continuous" },
              { "id": "width", "name": "Width", "value_type": "scalar", "default_value": { "type": "scalar", "value": 100.0 }, "range": [1.0, 100.0], "unit": "percent", "ui_hint": "slider", "automation": "continuous" },
              { "id": "transition", "name": "Transition", "value_type": "scalar", "default_value": { "type": "scalar", "value": 20.0 }, "range": [0.0, 100.0], "unit": "percent", "ui_hint": "slider", "automation": "continuous" },
              { "id": "color", "name": "Color", "value_type": "color", "default_value": { "type": "color", "value": "#ff0000" }, "unit": "color", "ui_hint": "color", "automation": "continuous" }
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
