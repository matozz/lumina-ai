import { create } from "zustand";
import type {
  CueDefinition,
  Diagnostic,
  EffectDefinitionDocument,
  ParameterValueDSL,
} from "@/bridge/types";

export type DraftValidationStatus = "pristine" | "dirty" | "validating" | "valid" | "invalid";
export type PreviewComparison = "pinned" | "working";

interface EffectDraftSession {
  mode: "edit" | "customize";
  pinned: EffectDefinitionDocument;
  working: EffectDefinitionDocument;
  lastKnownGood: EffectDefinitionDocument;
  diagnostics: Diagnostic[];
  status: DraftValidationStatus;
  generation: number;
}

export interface CueDraftSession {
  mode: "edit" | "new";
  pinned: CueDefinition;
  working: CueDefinition;
  lastKnownGood: CueDefinition;
  diagnostics: Diagnostic[];
  status: DraftValidationStatus;
  generation: number;
  selectedLayerId: string | null;
  mutedLayerIds: string[];
  soloLayerId: string | null;
}

interface AuthoringDraftState {
  effect: EffectDraftSession | null;
  cue: CueDraftSession | null;
  comparison: PreviewComparison;
}

export const useAuthoringDraftStore = create<AuthoringDraftState>()(() => ({
  effect: null,
  cue: null,
  comparison: "working",
}));

export const authoringDraftActions = {
  beginEffect: (effect: EffectDefinitionDocument, mode: EffectDraftSession["mode"] = "edit") => {
    const current = useAuthoringDraftStore.getState().effect;
    if (
      current?.mode === mode &&
      current.pinned.id === effect.id &&
      current.pinned.revision === effect.revision
    ) {
      return;
    }
    useAuthoringDraftStore.setState({
      effect: createEffectSession(effect, mode),
      comparison: "working",
    });
  },
  beginEffectCustomization: (
    pinned: EffectDefinitionDocument,
    customized: EffectDefinitionDocument,
  ) => {
    useAuthoringDraftStore.setState({
      effect: {
        mode: "customize",
        pinned: structuredClone(pinned),
        working: structuredClone(customized),
        lastKnownGood: structuredClone(customized),
        diagnostics: [],
        status: "dirty",
        generation: 1,
      },
      comparison: "working",
    });
  },
  updateEffect: (update: (draft: EffectDefinitionDocument) => void) => {
    const current = useAuthoringDraftStore.getState().effect;
    if (!current) return;
    const working = structuredClone(current.working);
    update(working);
    useAuthoringDraftStore.setState({
      effect: {
        ...current,
        working,
        diagnostics: [],
        status: "dirty",
        generation: current.generation + 1,
      },
    });
  },
  restoreEffectFallback: (parameterId: string) => {
    authoringDraftActions.updateEffect((draft) => {
      const parameter = draft.parameters.find((candidate) => candidate.id === parameterId);
      if (parameter?.safe_fallback) {
        parameter.default_value = structuredClone(parameter.safe_fallback);
      }
    });
  },
  markEffectValidating: (generation: number) => {
    const current = useAuthoringDraftStore.getState().effect;
    if (!current || current.generation !== generation) return;
    useAuthoringDraftStore.setState({ effect: { ...current, status: "validating" } });
  },
  acceptEffectValidation: (generation: number, normalized: EffectDefinitionDocument) => {
    const current = useAuthoringDraftStore.getState().effect;
    if (!current || current.generation !== generation) return;
    useAuthoringDraftStore.setState({
      effect: {
        ...current,
        working: structuredClone(normalized),
        lastKnownGood: structuredClone(normalized),
        diagnostics: [],
        status: "valid",
      },
    });
  },
  rejectEffectValidation: (generation: number, diagnostics: Diagnostic[]) => {
    const current = useAuthoringDraftStore.getState().effect;
    if (!current || current.generation !== generation) return;
    useAuthoringDraftStore.setState({
      effect: { ...current, diagnostics: structuredClone(diagnostics), status: "invalid" },
    });
  },
  discardEffect: () => {
    const current = useAuthoringDraftStore.getState().effect;
    if (!current) return;
    useAuthoringDraftStore.setState({
      effect: createEffectSession(current.pinned, "edit"),
      comparison: "working",
    });
  },
  revertEffectToLastKnownGood: () => {
    const current = useAuthoringDraftStore.getState().effect;
    if (!current) return;
    useAuthoringDraftStore.setState({
      effect: {
        ...current,
        working: structuredClone(current.lastKnownGood),
        diagnostics: [],
        status: "valid",
        generation: current.generation + 1,
      },
    });
  },
  commitEffect: (saved: EffectDefinitionDocument) =>
    useAuthoringDraftStore.setState({
      effect: createEffectSession(saved, "edit"),
      comparison: "working",
    }),
  beginCue: (cue: CueDefinition) => {
    const current = useAuthoringDraftStore.getState().cue;
    if (current?.pinned.id === cue.id && current.pinned.revision === cue.revision) return;
    useAuthoringDraftStore.setState({ cue: createCueSession(cue, "edit"), comparison: "working" });
  },
  beginNewCue: (cue: CueDefinition) => {
    const session = createCueSession(cue, "new");
    session.status = "dirty";
    session.generation = 1;
    useAuthoringDraftStore.setState({ cue: session, comparison: "working" });
  },
  updateCue: (update: (draft: CueDefinition) => void) => {
    const current = useAuthoringDraftStore.getState().cue;
    if (!current) return;
    const working = structuredClone(current.working);
    update(working);
    useAuthoringDraftStore.setState({
      cue: {
        ...current,
        working,
        diagnostics: [],
        status: "dirty",
        generation: current.generation + 1,
      },
    });
  },
  markCueValidating: (generation: number) => {
    const current = useAuthoringDraftStore.getState().cue;
    if (!current || current.generation !== generation) return;
    useAuthoringDraftStore.setState({ cue: { ...current, status: "validating" } });
  },
  acceptCueValidation: (generation: number, normalized: CueDefinition) => {
    const current = useAuthoringDraftStore.getState().cue;
    if (!current || current.generation !== generation) return;
    useAuthoringDraftStore.setState({
      cue: {
        ...current,
        working: structuredClone(normalized),
        lastKnownGood: structuredClone(normalized),
        diagnostics: [],
        status: "valid",
      },
    });
  },
  rejectCueValidation: (generation: number, diagnostics: Diagnostic[]) => {
    const current = useAuthoringDraftStore.getState().cue;
    if (!current || current.generation !== generation) return;
    useAuthoringDraftStore.setState({
      cue: { ...current, diagnostics: structuredClone(diagnostics), status: "invalid" },
    });
  },
  discardCue: () => {
    const current = useAuthoringDraftStore.getState().cue;
    if (!current) return;
    useAuthoringDraftStore.setState({
      cue: createCueSession(current.pinned, current.mode),
      comparison: "working",
    });
  },
  closeCue: () => useAuthoringDraftStore.setState({ cue: null, comparison: "working" }),
  revertCueToLastKnownGood: () => {
    const current = useAuthoringDraftStore.getState().cue;
    if (!current) return;
    useAuthoringDraftStore.setState({
      cue: {
        ...current,
        working: structuredClone(current.lastKnownGood),
        diagnostics: [],
        status: "valid",
        generation: current.generation + 1,
      },
    });
  },
  commitCue: (saved: CueDefinition) =>
    useAuthoringDraftStore.setState({
      cue: createCueSession(saved, "edit"),
      comparison: "working",
    }),
  selectCueLayer: (selectedLayerId: string | null) => {
    const current = useAuthoringDraftStore.getState().cue;
    if (!current) return;
    useAuthoringDraftStore.setState({ cue: { ...current, selectedLayerId } });
  },
  toggleCueLayerMute: (layerId: string) => {
    const current = useAuthoringDraftStore.getState().cue;
    if (!current) return;
    const mutedLayerIds = current.mutedLayerIds.includes(layerId)
      ? current.mutedLayerIds.filter((candidate) => candidate !== layerId)
      : [...current.mutedLayerIds, layerId];
    useAuthoringDraftStore.setState({ cue: { ...current, mutedLayerIds } });
  },
  toggleCueLayerSolo: (layerId: string) => {
    const current = useAuthoringDraftStore.getState().cue;
    if (!current) return;
    useAuthoringDraftStore.setState({
      cue: { ...current, soloLayerId: current.soloLayerId === layerId ? null : layerId },
    });
  },
  setComparison: (comparison: PreviewComparison) => useAuthoringDraftStore.setState({ comparison }),
  reset: () => useAuthoringDraftStore.setState({ effect: null, cue: null, comparison: "working" }),
};

export const authoringDraftSelectors = {
  effect: (state: AuthoringDraftState) => state.effect,
  cue: (state: AuthoringDraftState) => state.cue,
  comparison: (state: AuthoringDraftState) => state.comparison,
};

function createEffectSession(
  effect: EffectDefinitionDocument,
  mode: EffectDraftSession["mode"],
): EffectDraftSession {
  return {
    mode,
    pinned: structuredClone(effect),
    working: structuredClone(effect),
    lastKnownGood: structuredClone(effect),
    diagnostics: [],
    status: "pristine",
    generation: 0,
  };
}

function createCueSession(cue: CueDefinition, mode: CueDraftSession["mode"]): CueDraftSession {
  return {
    mode,
    pinned: structuredClone(cue),
    working: structuredClone(cue),
    lastKnownGood: structuredClone(cue),
    diagnostics: [],
    status: "pristine",
    generation: 0,
    selectedLayerId: cue.layers[0]?.id ?? null,
    mutedLayerIds: [],
    soloLayerId: null,
  };
}

export function valueMatches(left: ParameterValueDSL, right: ParameterValueDSL) {
  return JSON.stringify(left) === JSON.stringify(right);
}
