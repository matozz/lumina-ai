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
  generator: any;
}

export interface GroupDSL {
  name: string;
  fixtures: any;
  sort_by?: string;
}

export interface PhaserDSL {
  id: string;
  name: string;
  target: string;
  multiplier?: number;
  steps: any[];
  phase: any;
}

export interface TimelineEventDSL {
  beat: number;
  duration?: number;
  action: TimelineActionDefDSL;
}

export type TimelineActionDefDSL = 
  | { type: "phaser"; phaser: string }
  | { type: "tempo"; bpm: number }
  | { type: "stop_all" }
  | { type: "animate"; target: string; keyframes: KeyframeDSL[] };

export interface KeyframeDSL {
  time: number;
  value: any;
  easing?: string;
}

export interface TimelineDSL {
  events: TimelineEventDSL[];
}
