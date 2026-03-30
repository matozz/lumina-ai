export interface FixtureOutput {
  id: number;
  r: number;    // 0-255
  g: number;
  b: number;
  dimmer: number; // 0-1
}

export interface FramePayload {
  beat: number;
  full: boolean;
  outputs: FixtureOutput[];
}

export interface LayoutCoord {
  id: number;
  x: number;
  y: number;
  type: string;
}

export interface CompileResult {
  success: boolean;
  fixture_count: number;
  layout_coords: LayoutCoord[];
  group_names: string[];
  phasers: { id: string; name: string }[];
  sequence_names: string[];
  errors: CompileError[];
  warnings: CompileError[];
}

export interface CompileError {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface EngineStatePayload {
  is_playing: boolean;
  tempo: number;
  global_beat: number;
  active_phasers: { id: string; multiplier: number }[];
}

export interface ShowDSL {
  meta: {
    name: string;
  };
  patch: PatchDSL[];
  layout: LayoutDSL;
  groups: GroupDSL[];
  phasers: PhaserDSL[];
  timeline?: TimelineDSL;
}

export interface PatchDSL {
  type: "spot" | "pixel";
  id_range: [number, number];
}

export interface LayoutDSL {
  type: "generator";
  generator: GeneratorDSL;
}

export type GeneratorDSL = 
  | { shape: "matrix"; rows: number; columns: number; spacing: number; origin?: [number, number] }
  | { shape: "circle"; rings: number; increment: number; gap: number; center?: [number, number] }
  | { shape: "formula"; formula: FormulaDef }
  | { shape: "svg_path"; svgPath: SvgPathDef }
  | { shape: "custom"; fixtures: CustomFixturePos[] };

export interface FormulaDef {
  x: string;
  y: string;
  t_range: [number, number];
  count: number;
  scale?: number;
}

export interface SvgPathDef {
  d: string;
  sample_count: number;
  scale?: number;
}

export interface CustomFixturePos {
  id: number;
  x: number;
  y: number;
}

export interface GroupDSL {
  name: string;
  fixtures: number[] | { range: [number, number] };
  sort_by?: string;
}

export interface PhaserDSL {
  id: string;
  name: string;
  target: string;
  multiplier?: number;
  steps: PhaserStepDSL[];
  phase: PhaseConfigDSL;
}

export interface PhaserStepDSL {
  values: {
    color?: string;
    dimmer?: number;
  };
  width?: number;
  transition?: number;
  accel?: number;
  decel?: number;
}

export interface PhaseConfigDSL {
  mode: "spread" | "grouped";
  spread?: { from: number; to: number };
  grouped?: { group_size: number; spread: [number, number] };
}

export interface TimelineEventDSL {
  beat: number;
  duration?: number;
  action: TimelineActionDefDSL;
}

export type TimelineActionDefDSL = 
  | { type: "phaser"; phaser: string }
  | { type: "animate"; target: string; keyframes: KeyframeDSL[] };

export interface KeyframeDSL {
  time: number;
  value: any;
  easing?: string;
}

export interface TimelineDSL {
  events: TimelineEventDSL[];
}
