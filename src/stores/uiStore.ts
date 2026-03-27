import { create } from "zustand";
import type { CompileError, CompileResult } from "../bridge/types";

export type SequencerMode = 'live' | 'timeline';

export type CompileStatus = 'idle' | 'compiling' | 'success' | 'error';

interface ActivePhaserState {
  name: string;
  multiplier: number;
}

interface UiState {
  isPlaying: boolean;
  tempo: number;
  globalBeat: number;
  activePhasers: ActivePhaserState[];
  compileResult: CompileResult | null;
  compileErrors: CompileError[];
  compileStatus: CompileStatus;
  currentDslCode: string;
  parsedDsl: any | null;
  sequencerMode: SequencerMode;
  
  setIsPlaying: (val: boolean) => void;
  setTempo: (val: number) => void;
  setGlobalBeat: (val: number) => void;
  setActivePhasers: (val: ActivePhaserState[]) => void;
  setCompileResult: (res: CompileResult | null) => void;
  setCompileErrors: (errors: CompileError[]) => void;
  setCompileStatus: (status: CompileStatus) => void;
  setCurrentDslCode: (code: string) => void;
  setSequencerMode: (mode: SequencerMode) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isPlaying: false,
  tempo: 120,
  globalBeat: 0,
  activePhasers: [],
  compileResult: null,
  compileErrors: [],
  compileStatus: 'idle',
  currentDslCode: "",
  parsedDsl: null,
  sequencerMode: 'live',

  setIsPlaying: (val) => set({ isPlaying: val }),
  setTempo: (val) => set({ tempo: val }),
  setGlobalBeat: (val) => set({ globalBeat: val }),
  setActivePhasers: (val) => set({ activePhasers: val }),
  setCompileResult: (res) => set({ compileResult: res }),
  setCompileErrors: (errors) => set({ compileErrors: errors }),
  setCompileStatus: (status) => set({ compileStatus: status }),
  setCurrentDslCode: (code: string) => {
    let parsed = null;
    try {
      parsed = JSON.parse(code);
    } catch (e) {}
    set({ currentDslCode: code, parsedDsl: parsed });
  },
  setSequencerMode: (mode) => set({ sequencerMode: mode }),
}));
