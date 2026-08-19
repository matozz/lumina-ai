import type {
  AutomationTargetDSL,
  ParameterValueDSL,
  ShowDocumentV1,
  TimelineV1DSL,
} from "@/generated/show-document-v1";

export type {
  AutomationLaneDSL,
  CustomFixturePos,
  ClipPlaybackDSL,
  FormulaDef,
  GeneratorDSL,
  GroupDSL,
  GroupFixturesDSL,
  GroupRangeDSL,
  LayoutDSL,
  MetaDSL,
  PatchDSL,
  AutomationTargetDSL,
  EffectCatalogDSL,
  EffectDefinitionDSL,
  EffectGraphDSL,
  EffectTempoBehaviorDSL,
  EffectInstanceDSL,
  EffectNodeDSL,
  EffectPortDSL,
  EffectPortRefDSL,
  ParameterDefinitionDSL,
  ParameterValueDSL,
  SequenceStepDSL,
  EffectClipDSL,
  KeyframeDSL,
  KeyframeInterpolationDSL,
  KeyframeTangentDSL,
  OverlapPolicyDSL,
  OscillatorWaveformDSL,
  ShowDocumentV1,
  SortByDSL,
  StepValuesDSL,
  SvgPathDef,
  TempoMapDSL,
  TempoPointDSL,
  TimelineTrackDSL,
  TimelineV1DSL,
} from "@/generated/show-document-v1";

export type {
  CueRecipeDefinition,
  CueRecipeLayer,
  CueRecipeSceneDSL,
  CueRecipeTargetDSL,
  ProjectTemplateDefinition,
  ProductionCatalog,
} from "@/generated/production-catalog-v1";

export type {
  ArrangementAutomationLane,
  ArrangementAutomationTarget,
  ArrangementDocument,
  ArrangementMarker,
  AssetRef,
  CenterEdgesRegion,
  CheckerboardParity,
  CueAutomationLane,
  CueAutomationTarget,
  CueCapabilitySummary,
  CueClip,
  CueDefinition,
  CueLayer,
  CueLayerOverride,
  CueMixOverride,
  CueQuantize,
  CueRiskSummary,
  CueTrack,
  CueTriggerMode,
  CueTriggerPolicy,
  EffectDefinitionDocument,
  GridZone,
  LayoutAlgorithm,
  LayoutCategory,
  LayoutDefinition,
  LayoutEditorCapability,
  LayoutFixtureSizeOverride,
  LayoutGap,
  LayoutGeometry,
  LayoutOrientation,
  LayoutParameterDefinition,
  LayoutParameterValueType,
  LayoutPitch,
  LayoutPoint,
  LayoutSize,
  MixPolicy,
  PrimaryVisualEventDSL,
  ProjectBundle,
  ProjectManifest,
  StageDocument,
  TargetSetDefinition,
  TargetSetRef,
  TargetSetSelector,
  TargetSetWeight,
  TargetingDuration,
  TargetingDurationUnit,
  TargetingSceneDefinition,
  TargetingSceneRef,
  TargetingSceneStep,
  TargetingSelection,
  TargetingTransition,
  TimeSignaturePoint,
} from "@/generated/project-contract-v1";

export type { UserAssetPack } from "@/generated/user-asset-pack-v1";

export type {
  TemporalAliasingMetric,
  TemporalAliasingRisk,
  TemporalAnalysisIdentity,
  TemporalAnalysisRequest,
  TemporalCentroidMetric,
  TemporalDistributionMetric,
  TemporalFingerprintReport,
  TemporalPeakMetric,
  TemporalSamplingConfig,
  TemporalSpeedFingerprint,
  TemporalStrobeMetric,
} from "@/generated/temporal-fingerprint-v1";

export type FullDSL = ShowDocumentV1;
export type TimelineDSL = TimelineV1DSL;
export interface CueRecipeRef {
  id: string;
  revision: number;
}
export type FromTo = ParameterValueDSL["value"];
export type Easing = "hold" | "linear" | "ease_in" | "ease_out" | "ease_in_out" | "bezier";
export type TimelineActionDSL =
  | { type: "effect"; instance_id: string }
  | { type: "animate"; target: AutomationTargetDSL; from: FromTo; to: FromTo; easing?: Easing };
export interface TimelineEventDSL {
  id?: string;
  beat: number;
  duration?: number;
  action: TimelineActionDSL;
  source_track_id?: string;
  source_item_id?: string;
}

export type AttributeValue =
  | { type: "scalar"; value: number }
  | { type: "color"; value: [number, number, number] }
  | { type: "angle"; value: number }
  | { type: "enum"; value: string }
  | { type: "boolean"; value: boolean };

export interface AttributePayload {
  id: string;
  value: AttributeValue;
}

export interface FixtureFramePayload {
  id: number;
  profile_id: string;
  attributes: AttributePayload[];
}

export interface FramePayload {
  show_revision: number;
  frame_sequence: number;
  logical_beat: number;
  full: boolean;
  outputs: FixtureFramePayload[];
}

export interface LayoutCoord {
  id: number;
  x: number;
  y: number;
  type: string;
  width?: number;
  height?: number;
  patched?: boolean;
}

export interface CompileResult {
  success: boolean;
  show_revision: number | null;
  fixture_count: number;
  layout_coords: LayoutCoord[];
  group_names: string[];
  phasers: { id: string; name: string }[];
  sequence_names: string[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

export interface LoadShowResult {
  document: ShowDocumentV1;
}

export interface ShowSnapshotState {
  published_revision: number | null;
  live_revision: number | null;
}

export interface Diagnostic {
  code: string;
  severity: "error" | "warning";
  path: string;
  message: string;
  hint: string | null;
  asset?: {
    kind: string;
    id: string;
    revision: number;
  };
  recovery?: {
    action: string;
    label: string;
    path?: string;
  };
}

export interface EngineStatePayload {
  transport_state: TransportState;
  transport_revision: number;
  tempo: number;
  global_beat: number;
  active_phasers: { id: string; multiplier: number }[];
  blackout: boolean;
  output_rate_hz: number;
  frame_lag_ms: number;
  output_adapter: string;
  last_output_error: string | null;
  live_revision: number | null;
}

export interface LiveEffectInfo {
  instance_id: string;
  definition_id: string;
  definition_revision: number;
  name: string;
  target_group_id: string;
}

export interface LiveEffectCatalog {
  show_revision: number;
  effects: LiveEffectInfo[];
}

export interface QueuedLivePad {
  target_beat: number;
}

export type PreviewSource =
  | { type: "authoring_draft" }
  | { type: "rehearsal_draft" }
  | { type: "rehearsal_published"; revision: number };

export type RenderContext =
  | { type: "stage" }
  | {
      type: "effect";
      effect_ref: import("@/generated/project-contract-v1").AssetRef;
      target_set_id: string;
    }
  | { type: "cue"; cue_ref: import("@/generated/project-contract-v1").AssetRef }
  | { type: "arrangement" };

export interface ProjectPreviewFrame {
  generation: number;
  source: PreviewSource;
  context: RenderContext;
  project_ref: import("@/generated/project-contract-v1").AssetRef;
  stage_ref: import("@/generated/project-contract-v1").AssetRef;
  arrangement_ref: import("@/generated/project-contract-v1").AssetRef;
  playhead_tick: number;
  layout_coords: LayoutCoord[];
  outputs: FixtureFramePayload[];
}

export interface ProjectCompileResult {
  success: boolean;
  show_revision: number | null;
  project_ref: import("@/generated/project-contract-v1").AssetRef | null;
  stage_ref: import("@/generated/project-contract-v1").AssetRef | null;
  arrangement_ref: import("@/generated/project-contract-v1").AssetRef | null;
  fixture_count: number;
  layout_coords: LayoutCoord[];
  errors: Diagnostic[];
}

export type TransportState = "stopped" | "playing" | "paused" | "seeking" | "error";
