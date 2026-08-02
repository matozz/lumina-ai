import { invoke } from "@tauri-apps/api/core";
import type {
  CompileResult,
  Diagnostic,
  LayoutCoord,
  FullDSL,
  LoadShowResult,
  ShowSnapshotState,
} from "./types";

export const engine = {
  loadDSL: (json: string) => invoke<CompileResult>("load_dsl", { dslJson: json }),

  publishDSL: (json: string) => invoke<CompileResult>("publish_dsl", { dslJson: json }),

  activateShowRevision: (revision: number) =>
    invoke<ShowSnapshotState>("activate_show_revision", { revision }),

  getShowSnapshotState: () => invoke<ShowSnapshotState>("get_show_snapshot_state"),

  validateDSL: (json: string) => invoke<Diagnostic[]>("validate_dsl", { dslJson: json }),

  play: () => invoke("play"),
  pause: () => invoke("pause"),
  stop: () => invoke("stop"),
  seek: (beat: number) => invoke("seek", { beat }),
  setTempo: (bpm: number) => invoke("set_tempo", { bpm }),
  setOutputRate: (hz: 30 | 60 | 120) => invoke("set_output_rate", { hz }),

  triggerPhaser: (id: string, multiplier?: number) =>
    invoke("trigger_phaser", { phaserId: id, multiplier: multiplier ?? 1.0 }),

  stopPhaser: (id: string) => invoke("stop_phaser", { phaserId: id }),

  saveShow: (path: string, dsl: FullDSL) =>
    invoke("save_show", { path, dslJson: JSON.stringify(dsl) }),

  loadShow: (path: string) => invoke<LoadShowResult>("load_show", { path }),

  setSequencerMode: (mode: "live" | "timeline") => invoke("set_sequencer_mode", { mode }),

  getLayoutCoords: () => invoke<LayoutCoord[]>("get_layout_coords"),

  requestFullFrame: () => invoke("request_full_frame"),
};
