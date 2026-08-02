import type {
  AnimatableValueDSL,
  EasingDSL,
  ShowDocumentV3,
  TimelineActionV3DSL,
  TimelineEventV3DSL,
  TimelineV3DSL,
} from "@/generated/show-document-v3";

export type {
  AnimatableValueDSL,
  CustomFixturePos,
  EasingDSL,
  FormulaDef,
  GeneratorDSL,
  GroupDSL,
  GroupFixturesDSL,
  GroupRangeDSL,
  LayoutDSL,
  MetaDSL,
  PatchDSL,
  AutomationTargetV3DSL,
  EffectCatalogDSL,
  EffectDefinitionDSL,
  EffectGraphDSL,
  EffectInstanceDSL,
  EffectNodeDSL,
  EffectPortDSL,
  EffectPortRefDSL,
  ParameterDefinitionDSL,
  ParameterValueDSL,
  PhaserStepDSL,
  ShowDocumentV3,
  StepValuesDSL,
  SvgPathDef,
  TimelineActionV3DSL,
  TimelineEventV3DSL,
  TimelineV3DSL,
} from "@/generated/show-document-v3";

export type FullDSL = ShowDocumentV3;
export type TimelineActionDSL = TimelineActionV3DSL;
export type TimelineDSL = TimelineV3DSL;
export type TimelineEventDSL = TimelineEventV3DSL;
export type FromTo = AnimatableValueDSL;
export type Easing = EasingDSL;

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
  migration_report: MigrationReport;
}

export interface MigrationChange {
  code: string;
  path: string;
  message: string;
}

export interface MigrationReport {
  from_version: number | null;
  to_version: number;
  changes: MigrationChange[];
}

export interface LoadShowResult {
  document: ShowDocumentV3;
  migration_report: MigrationReport;
}

export interface Diagnostic {
  code: string;
  severity: "error" | "warning";
  path: string;
  message: string;
  hint: string | null;
}

export interface EngineStatePayload {
  transport_state: TransportState;
  transport_revision: number;
  tempo: number;
  global_beat: number;
  active_phasers: { id: string; multiplier: number }[];
}

export type TransportState = "stopped" | "playing" | "paused" | "seeking" | "error";
