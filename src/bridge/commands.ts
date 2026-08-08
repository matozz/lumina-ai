import { invoke } from "@tauri-apps/api/core";
import type {
  CompileResult,
  Diagnostic,
  EffectDefinitionDocument,
  AssetRef,
  FixtureFramePayload,
  LayoutDefinition,
  LayoutCoord,
  FullDSL,
  LoadShowResult,
  LiveEffectCatalog,
  QueuedLivePad,
  MigratedProject,
  ProjectBundle,
  ProjectCompileResult,
  ProjectPreviewFrame,
  ProductionCatalog,
  PreviewSource,
  CueDefinition,
  CueRecipeRef,
  RenderContext,
  ShowSnapshotState,
  StageDocument,
} from "./types";

export const engine = {
  loadDSL: (json: string) => invoke<CompileResult>("load_dsl", { dslJson: json }),

  publishDSL: (json: string) => invoke<CompileResult>("publish_dsl", { dslJson: json }),

  previewDSL: (json: string) => invoke<CompileResult>("preview_dsl", { dslJson: json }),

  previewEffectLoop: (json: string, instanceId: string, frameCount = 64) =>
    invoke<FixtureFramePayload[][]>("preview_effect_loop", {
      dslJson: json,
      instanceId,
      frameCount,
    }),

  previewProject: (options: {
    project?: ProjectBundle;
    arrangementRef?: AssetRef;
    source: PreviewSource;
    context: RenderContext;
    playheadTick: number;
  }) =>
    invoke<ProjectPreviewFrame>("preview_project", {
      projectJson: options.project ? JSON.stringify(options.project) : null,
      arrangementRef: options.arrangementRef ?? null,
      source: options.source,
      context: options.context,
      playheadTick: options.playheadTick,
    }),

  renderProjectPreview: (context: RenderContext, playheadTick: number) =>
    invoke<ProjectPreviewFrame>("render_project_preview", { context, playheadTick }),

  publishProject: (project: ProjectBundle, arrangementRef: AssetRef) =>
    invoke<ProjectCompileResult>("publish_project", {
      projectJson: JSON.stringify(project),
      arrangementRef,
    }),

  activateShowRevision: (revision: number) =>
    invoke<ShowSnapshotState>("activate_show_revision", { revision }),

  getShowSnapshotState: () => invoke<ShowSnapshotState>("get_show_snapshot_state"),

  validateDSL: (json: string) => invoke<Diagnostic[]>("validate_dsl", { dslJson: json }),

  getProductionCatalog: () => invoke<ProductionCatalog>("get_production_catalog"),

  validateEffectWorkingDraft: (effect: EffectDefinitionDocument) =>
    invoke<EffectDefinitionDocument>("validate_effect_working_draft", { effect }),

  validateProjectWorkingDraft: (project: ProjectBundle) =>
    invoke<ProjectBundle>("validate_project_working_draft", {
      projectJson: JSON.stringify(project),
    }),

  resolveProductionCueRecipe: (options: {
    project: ProjectBundle;
    recipeRef: CueRecipeRef;
    stageRef: AssetRef;
    cueId: string;
    cueRevision: number;
    cueName: string;
  }) =>
    invoke<CueDefinition>("resolve_production_cue_recipe", {
      projectJson: JSON.stringify(options.project),
      recipeRef: options.recipeRef,
      stageRef: options.stageRef,
      cueId: options.cueId,
      cueRevision: options.cueRevision,
      cueName: options.cueName,
    }),

  play: () => invoke("play"),
  pause: () => invoke("pause"),
  stop: () => invoke("stop"),
  seek: (beat: number) => invoke("seek", { beat }),
  setTempo: (bpm: number) => invoke("set_tempo", { bpm }),
  setOutputRate: (hz: 30 | 60 | 120) => invoke("set_output_rate", { hz }),

  getLiveEffects: () => invoke<LiveEffectCatalog>("get_live_effects"),

  queueLivePad: (options: {
    effectId: string;
    action: "start" | "stop";
    quantize: "off" | "beat" | "bar";
    multiplier?: number;
    exclusiveIds?: string[];
    oneShotBeats?: number;
  }) =>
    invoke<QueuedLivePad>("queue_live_pad", {
      effectId: options.effectId,
      action: options.action,
      quantize: options.quantize,
      multiplier: options.multiplier ?? 1,
      exclusiveIds: options.exclusiveIds ?? [],
      oneShotBeats: options.oneShotBeats,
    }),

  setBlackout: (enabled: boolean) => invoke("set_blackout", { enabled }),

  triggerPhaser: (id: string, multiplier?: number) =>
    invoke("trigger_phaser", { phaserId: id, multiplier: multiplier ?? 1.0 }),

  stopPhaser: (id: string) => invoke("stop_phaser", { phaserId: id }),

  saveShow: (path: string, dsl: FullDSL) =>
    invoke("save_show", { path, dslJson: JSON.stringify(dsl) }),

  loadShow: (path: string) => invoke<LoadShowResult>("load_show", { path }),

  saveProject: (path: string, project: ProjectBundle) =>
    invoke("save_project", { path, projectJson: JSON.stringify(project) }),

  loadProject: (path: string) => invoke<MigratedProject>("load_project", { path }),

  migrateShowProject: (json: string) =>
    invoke<MigratedProject>("migrate_show_project", { dslJson: json }),

  setSequencerMode: (mode: "live" | "timeline") => invoke("set_sequencer_mode", { mode }),

  getLayoutCoords: () => invoke<LayoutCoord[]>("get_layout_coords"),

  previewLayout: (layout: LayoutDefinition, stage: StageDocument) =>
    invoke<LayoutCoord[]>("preview_layout", { layout, stage }),

  requestFullFrame: () => invoke("request_full_frame"),
};
