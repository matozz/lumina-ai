import { create } from "zustand";
import { validateShowDocument } from "../document/showDocument";
import type {
  CompileResult,
  Diagnostic,
  EngineStatePayload,
  FullDSL,
  LiveEffectCatalog,
  LiveEffectInfo,
  TransportState,
} from "../bridge/types";
import { applyDocumentTransaction, type DocumentTransaction } from "../document/commands";

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
  liveEffects: LiveEffectInfo[];
  blackout: boolean;
  outputRateHz: number;
  frameLagMs: number;
  outputAdapter: string;
  lastOutputError: string | null;
  liveShowRevision: number | null;
  compileResult: CompileResult | null;
  compileErrors: Diagnostic[];
  compileStatus: CompileStatus;
  currentDslCode: string;
  parsedDsl: FullDSL | null;
  documentHistory: DocumentHistoryEntry[];
  historyCursor: number;
  savedHistoryCursor: number | null;
  isDocumentDirty: boolean;
  sequencerMode: SequencerMode;
}

export interface DocumentHistoryEntry {
  id: string;
  label: string;
  before: FullDSL;
  after: FullDSL;
}

export const useEngineStore = create<EngineState>()(() => ({
  transportState: "stopped",
  transportRevision: 0,
  tempo: 120,
  globalBeat: 0,
  activePhasers: [],
  liveEffects: [],
  blackout: false,
  outputRateHz: 60,
  frameLagMs: 0,
  outputAdapter: "preview",
  lastOutputError: null,
  liveShowRevision: null,
  compileResult: null,
  compileErrors: [],
  compileStatus: "idle",
  currentDslCode: "",
  parsedDsl: null,
  documentHistory: [],
  historyCursor: 0,
  savedHistoryCursor: 0,
  isDocumentDirty: false,
  sequencerMode: "live",
}));

// Actions
export const engineActions = {
  setTransport: (state: TransportState, revision: number) =>
    useEngineStore.setState({ transportState: state, transportRevision: revision }),
  setTempo: (val: number) => useEngineStore.setState({ tempo: val }),
  setGlobalBeat: (val: number) => useEngineStore.setState({ globalBeat: val }),
  setActivePhasers: (val: ActivePhaserState[]) => useEngineStore.setState({ activePhasers: val }),
  setLiveEffects: (liveEffects: LiveEffectInfo[]) => useEngineStore.setState({ liveEffects }),
  setLiveEffectCatalog: (catalog: LiveEffectCatalog) =>
    useEngineStore.setState({
      liveEffects: catalog.effects,
      liveShowRevision: catalog.show_revision,
    }),
  applyRuntimeState: (payload: EngineStatePayload) =>
    useEngineStore.setState((state) => ({
      transportState: payload.transport_state,
      transportRevision: payload.transport_revision,
      tempo: payload.tempo,
      globalBeat: payload.global_beat,
      activePhasers: sameActivePhasers(state.activePhasers, payload.active_phasers)
        ? state.activePhasers
        : payload.active_phasers,
      blackout: payload.blackout,
      outputRateHz: payload.output_rate_hz,
      frameLagMs: payload.frame_lag_ms,
      outputAdapter: payload.output_adapter,
      lastOutputError: payload.last_output_error,
      liveShowRevision: payload.live_revision,
    })),
  setCompileResult: (res: CompileResult | null) => useEngineStore.setState({ compileResult: res }),
  setCompileErrors: (errors: Diagnostic[]) => useEngineStore.setState({ compileErrors: errors }),
  setCompileStatus: (status: CompileStatus) => useEngineStore.setState({ compileStatus: status }),
  setCurrentDslCode: (code: string) => {
    if (useEngineStore.getState().currentDslCode === code) return;
    useEngineStore.setState({
      currentDslCode: code,
      parsedDsl: parseDslCode(code),
      documentHistory: [],
      historyCursor: 0,
      savedHistoryCursor: null,
      isDocumentDirty: true,
    });
  },
  loadCurrentDslCode: (code: string) =>
    useEngineStore.setState({
      currentDslCode: code,
      parsedDsl: parseDslCode(code),
      documentHistory: [],
      historyCursor: 0,
      savedHistoryCursor: 0,
      isDocumentDirty: false,
    }),
  applyDocumentTransaction: (transaction: DocumentTransaction) => {
    const state = useEngineStore.getState();
    if (!state.parsedDsl) throw new Error("Cannot edit an invalid show document");
    const before = state.parsedDsl;
    const after = applyDocumentTransaction(before, transaction);
    if (after === before || JSON.stringify(after) === JSON.stringify(before)) return;
    const validation = validateShowDocument(after);
    if (!validation.success) throw new Error("DocumentCommand produced an invalid V4 document");
    const retainedHistory = state.documentHistory.slice(0, state.historyCursor);
    const savedHistoryCursor =
      state.savedHistoryCursor !== null && state.savedHistoryCursor > state.historyCursor
        ? null
        : state.savedHistoryCursor;
    retainedHistory.push({
      id: transaction.id,
      label: transaction.label,
      before,
      after: validation.data,
    });
    const historyCursor = retainedHistory.length;
    setDocumentState(validation.data, {
      documentHistory: retainedHistory,
      historyCursor,
      savedHistoryCursor,
      isDocumentDirty: savedHistoryCursor !== historyCursor,
    });
  },
  undoDocument: () => {
    const state = useEngineStore.getState();
    if (state.historyCursor === 0) return;
    const historyCursor = state.historyCursor - 1;
    setDocumentState(state.documentHistory[historyCursor].before, {
      historyCursor,
      isDocumentDirty: state.savedHistoryCursor !== historyCursor,
    });
  },
  redoDocument: () => {
    const state = useEngineStore.getState();
    if (state.historyCursor >= state.documentHistory.length) return;
    const historyCursor = state.historyCursor + 1;
    setDocumentState(state.documentHistory[state.historyCursor].after, {
      historyCursor,
      isDocumentDirty: state.savedHistoryCursor !== historyCursor,
    });
  },
  markDocumentSaved: () => {
    const historyCursor = useEngineStore.getState().historyCursor;
    useEngineStore.setState({
      savedHistoryCursor: historyCursor,
      isDocumentDirty: false,
    });
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
  liveEffects: (state: EngineState) => state.liveEffects,
  blackout: (state: EngineState) => state.blackout,
  outputRateHz: (state: EngineState) => state.outputRateHz,
  frameLagMs: (state: EngineState) => state.frameLagMs,
  outputAdapter: (state: EngineState) => state.outputAdapter,
  lastOutputError: (state: EngineState) => state.lastOutputError,
  liveShowRevision: (state: EngineState) => state.liveShowRevision,
  compileResult: (state: EngineState) => state.compileResult,
  compileErrors: (state: EngineState) => state.compileErrors,
  compileStatus: (state: EngineState) => state.compileStatus,
  currentDslCode: (state: EngineState) => state.currentDslCode,
  parsedDsl: (state: EngineState) => state.parsedDsl,
  canUndo: (state: EngineState) => state.historyCursor > 0,
  canRedo: (state: EngineState) => state.historyCursor < state.documentHistory.length,
  isDocumentDirty: (state: EngineState) => state.isDocumentDirty,
  sequencerMode: (state: EngineState) => state.sequencerMode,
};

function sameActivePhasers(left: ActivePhaserState[], right: ActivePhaserState[]) {
  return (
    left.length === right.length &&
    left.every(
      (active, index) =>
        active.id === right[index]?.id && active.multiplier === right[index].multiplier,
    )
  );
}

function parseDslCode(code: string): FullDSL | null {
  try {
    const validation = validateShowDocument(JSON.parse(code));
    return validation.success ? validation.data : null;
  } catch {
    return null;
  }
}

function setDocumentState(document: FullDSL, state: Partial<EngineState>) {
  useEngineStore.setState({
    ...state,
    currentDslCode: JSON.stringify(document, null, 2),
    parsedDsl: document,
  });
}
