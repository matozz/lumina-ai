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
}

export interface CompileResult {
  success: boolean;
  fixture_count: number;
  layout_coords: LayoutCoord[];
  group_names: string[];
  phaser_names: string[];
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
  active_phasers: string[];
  current_cue: { sequence: string; cue_id: number; cue_name?: string } | null;
}

export interface ShowDSL {
  meta: {
    name: string;
    version: string;
    tempo: number;
  };
  patch: PatchDSL[];
  layout: LayoutDSL;
  groups: GroupDSL[];
  presets: PresetDSL[];
  phasers: PhaserDSL[];
  sequences: SequenceDSL[];
  timeline?: TimelineDSL;
}

export interface PatchDSL {
  type: "spot" | "wash" | "pixel";
  color: "rgb" | "rgbw";
  idRange: [number, number];
}

export interface LayoutDSL {
  type: "generator";
  generator: any;
}

export interface GroupDSL {
  name: string;
  fixtures: any;
  sortBy?: string;
}

export interface PresetDSL {
  name: string;
  type: "color" | "dimmer" | "composite";
  values: any;
}

export interface PhaserDSL {
  name: string;
  target: string;
  speed: number;
  steps: any[];
  phase: any;
}

export interface SequenceDSL {
  name: string;
  cues: any[];
}

export interface TimelineDSL {
  bpm: number;
  events: any[];
}
