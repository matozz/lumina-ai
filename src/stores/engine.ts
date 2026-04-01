import { create } from "zustand";
import type { CompileError, CompileResult, FullDSL } from "../bridge/types";

export type SequencerMode = "live" | "timeline";
export type CompileStatus = "idle" | "compiling" | "success" | "error";

interface ActivePhaserState {
  id: string;
  multiplier: number;
}

export interface EngineState {
  isPlaying: boolean;
  tempo: number;
  globalBeat: number;
  activePhasers: ActivePhaserState[];
  compileResult: CompileResult | null;
  compileErrors: CompileError[];
  compileStatus: CompileStatus;
  currentDslCode: string;
  parsedDsl: FullDSL | null;
  sequencerMode: SequencerMode;
}

export const useEngineStore = create<EngineState>()(() => ({
  isPlaying: false,
  tempo: 120,
  globalBeat: 0,
  activePhasers: [],
  compileResult: null,
  compileErrors: [],
  compileStatus: "idle",
  currentDslCode: "",
  parsedDsl: null,
  sequencerMode: "live",
}));

// Actions
export const engineActions = {
  setIsPlaying: (val: boolean) => useEngineStore.setState({ isPlaying: val }),
  setTempo: (val: number) => useEngineStore.setState({ tempo: val }),
  setGlobalBeat: (val: number) => useEngineStore.setState({ globalBeat: val }),
  setActivePhasers: (val: ActivePhaserState[]) => useEngineStore.setState({ activePhasers: val }),
  setCompileResult: (res: CompileResult | null) => useEngineStore.setState({ compileResult: res }),
  setCompileErrors: (errors: CompileError[]) => useEngineStore.setState({ compileErrors: errors }),
  setCompileStatus: (status: CompileStatus) => useEngineStore.setState({ compileStatus: status }),
  setCurrentDslCode: (code: string) => {
    let parsed = null;
    try {
      parsed = JSON.parse(code);
    } catch (e) {}
    useEngineStore.setState({ currentDslCode: code, parsedDsl: parsed as FullDSL });
  },
  setSequencerMode: (mode: SequencerMode) => useEngineStore.setState({ sequencerMode: mode }),
};

// Selectors
export const engineSelectors = {
  isPlaying: (state: EngineState) => state.isPlaying,
  tempo: (state: EngineState) => state.tempo,
  globalBeat: (state: EngineState) => state.globalBeat,
  activePhasers: (state: EngineState) => state.activePhasers,
  compileResult: (state: EngineState) => state.compileResult,
  compileErrors: (state: EngineState) => state.compileErrors,
  compileStatus: (state: EngineState) => state.compileStatus,
  currentDslCode: (state: EngineState) => state.currentDslCode,
  parsedDsl: (state: EngineState) => state.parsedDsl,
  sequencerMode: (state: EngineState) => state.sequencerMode,
};
