import { create } from "zustand";
import { validateShowDocument } from "../document/showDocument";
import type { CompileResult, Diagnostic, FullDSL, TransportState } from "../bridge/types";

export type SequencerMode = "live" | "timeline";
export type CompileStatus = "idle" | "compiling" | "success" | "error";

interface ActivePhaserState {
  id: string;
  multiplier: number;
}

export interface EngineState {
  transportState: TransportState;
  transportRevision: number;
  tempo: number;
  globalBeat: number;
  activePhasers: ActivePhaserState[];
  compileResult: CompileResult | null;
  compileErrors: Diagnostic[];
  compileStatus: CompileStatus;
  currentDslCode: string;
  parsedDsl: FullDSL | null;
  sequencerMode: SequencerMode;
}

export const useEngineStore = create<EngineState>()(() => ({
  transportState: "stopped",
  transportRevision: 0,
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
  setTransport: (state: TransportState, revision: number) =>
    useEngineStore.setState({ transportState: state, transportRevision: revision }),
  setTempo: (val: number) => useEngineStore.setState({ tempo: val }),
  setGlobalBeat: (val: number) => useEngineStore.setState({ globalBeat: val }),
  setActivePhasers: (val: ActivePhaserState[]) => useEngineStore.setState({ activePhasers: val }),
  setCompileResult: (res: CompileResult | null) => useEngineStore.setState({ compileResult: res }),
  setCompileErrors: (errors: Diagnostic[]) => useEngineStore.setState({ compileErrors: errors }),
  setCompileStatus: (status: CompileStatus) => useEngineStore.setState({ compileStatus: status }),
  setCurrentDslCode: (code: string) => {
    let parsed: FullDSL | null = null;
    try {
      const validation = validateShowDocument(JSON.parse(code));
      parsed = validation.success ? validation.data : null;
    } catch {
      parsed = null;
    }
    useEngineStore.setState({ currentDslCode: code, parsedDsl: parsed });
  },
  setSequencerMode: (mode: SequencerMode) => useEngineStore.setState({ sequencerMode: mode }),
};

// Selectors
export const engineSelectors = {
  isPlaying: (state: EngineState) => state.transportState === "playing",
  transportState: (state: EngineState) => state.transportState,
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
