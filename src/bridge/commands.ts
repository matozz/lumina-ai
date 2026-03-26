import { invoke } from "@tauri-apps/api/core";
import type { CompileResult, CompileError, LayoutCoord, ShowDSL } from "./types";

export const engine = {
  loadDSL: (json: string) =>
    invoke<CompileResult>("load_dsl", { dslJson: json }),

  validateDSL: (json: string) =>
    invoke<CompileError[]>("validate_dsl", { dslJson: json }),

  play: () => invoke("play"),
  stop: () => invoke("stop"),
  setTempo: (bpm: number) => invoke("set_tempo", { bpm }),

  triggerPhaser: (name: string) =>
    invoke("trigger_phaser", { phaserName: name }),

  stopPhaser: (name: string) =>
    invoke("stop_phaser", { phaserName: name }),

  triggerCue: (seq: string, cueId: number) =>
    invoke("trigger_cue", { seq, cueId }),

  goNextCue: (seq: string) =>
    invoke("go_next_cue", { seq }),

  saveShow: (path: string, dsl: ShowDSL) =>
    invoke("save_show", { path, dslJson: JSON.stringify(dsl) }),

  loadShow: (path: string) =>
    invoke<string>("load_show", { path }).then(json => JSON.parse(json) as ShowDSL),

  setSequencerMode: (mode: "live" | "timeline") => 
    invoke("set_sequencer_mode", { mode }),

  getLayoutCoords: () =>
    invoke<LayoutCoord[]>("get_layout_coords"),
};
