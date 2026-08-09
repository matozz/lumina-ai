import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authoringTransportActions } from "@/authoring/transport";
import type { AssetRef, CueDefinition, ShowSnapshotState } from "@/bridge/types";
import type { ArrangementSnapPreset } from "@/panel/timelineGeometry";

export type WorkspaceId = "stage" | "effect-lab" | "cues" | "arrange" | "live";
export type PublishStatus = "idle" | "publishing" | "activating" | "error";
export type LivePadMode = "toggle" | "momentary" | "one_shot";
export type LivePadQuantize = "off" | "beat" | "bar";

export interface LivePadConfig {
  mode: LivePadMode;
  exclusiveGroup: string;
  oneShotBeats: number;
}

export interface PatchAddress {
  universe: number;
  startChannel: number;
}

export interface ArrangeBuiltInCueSelection {
  recipeRef: AssetRef;
  cue: CueDefinition;
}

export interface WorkspaceState {
  activeWorkspace: WorkspaceId;
  advancedMode: boolean;
  libraryVisible: boolean;
  inspectorVisible: boolean;
  arrangeTimelineFocus: boolean;
  arrangePreviewSize: number;
  arrangeTimelineBeatWidth: number;
  arrangeTimelineSnapPreset: ArrangementSnapPreset;
  selectedEffectId: string | null;
  selectedLiveEffectId: string | null;
  selectedArrangeBuiltInCue: ArrangeBuiltInCueSelection | null;
  favoriteEffectIds: string[];
  livePadQuantize: LivePadQuantize;
  livePadConfigs: Record<string, LivePadConfig>;
  patchAddresses: PatchAddress[];
  publishedRevision: number | null;
  liveRevision: number | null;
  publishStatus: PublishStatus;
  statusMessage: string | null;
}

const initialState: WorkspaceState = {
  activeWorkspace: "stage",
  advancedMode: false,
  libraryVisible: true,
  inspectorVisible: true,
  arrangeTimelineFocus: false,
  arrangePreviewSize: 38,
  arrangeTimelineBeatWidth: 48,
  arrangeTimelineSnapPreset: "half",
  selectedEffectId: null,
  selectedLiveEffectId: null,
  selectedArrangeBuiltInCue: null,
  favoriteEffectIds: [],
  livePadQuantize: "beat",
  livePadConfigs: {},
  patchAddresses: [{ universe: 1, startChannel: 1 }],
  publishedRevision: null,
  liveRevision: null,
  publishStatus: "idle",
  statusMessage: null,
};

const LOCAL_WORKSPACE_PREFERENCES_VERSION = 6;

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(() => initialState, {
    name: "lumina-workspace-v1",
    version: LOCAL_WORKSPACE_PREFERENCES_VERSION,
    migrate: (persistedState, version) => {
      if (version < LOCAL_WORKSPACE_PREFERENCES_VERSION) return structuredClone(initialState);
      const state = persistedState as Omit<Partial<WorkspaceState>, "activeWorkspace"> & {
        activeWorkspace?: string;
      };
      return state as WorkspaceState;
    },
    partialize: (state) => ({
      activeWorkspace: state.activeWorkspace,
      libraryVisible: state.libraryVisible,
      inspectorVisible: state.inspectorVisible,
      arrangeTimelineFocus: state.arrangeTimelineFocus,
      arrangePreviewSize: state.arrangePreviewSize,
      arrangeTimelineBeatWidth: state.arrangeTimelineBeatWidth,
      arrangeTimelineSnapPreset: state.arrangeTimelineSnapPreset,
      favoriteEffectIds: state.favoriteEffectIds,
      livePadQuantize: state.livePadQuantize,
      livePadConfigs: state.livePadConfigs,
      patchAddresses: state.patchAddresses,
    }),
  }),
);

export const workspaceActions = {
  setActiveWorkspace: (activeWorkspace: WorkspaceId) => {
    if (useWorkspaceStore.getState().activeWorkspace !== activeWorkspace) {
      authoringTransportActions.stopAll();
    }
    useWorkspaceStore.setState({ activeWorkspace, advancedMode: false, statusMessage: null });
  },
  setAdvancedMode: (advancedMode: boolean) => useWorkspaceStore.setState({ advancedMode }),
  setLibraryVisible: (libraryVisible: boolean) => useWorkspaceStore.setState({ libraryVisible }),
  setInspectorVisible: (inspectorVisible: boolean) =>
    useWorkspaceStore.setState({ inspectorVisible }),
  setArrangeTimelineFocus: (arrangeTimelineFocus: boolean) =>
    useWorkspaceStore.setState({ arrangeTimelineFocus }),
  setArrangePreviewSize: (arrangePreviewSize: number) =>
    useWorkspaceStore.setState({
      arrangePreviewSize: Math.max(20, Math.min(70, arrangePreviewSize)),
    }),
  setArrangeTimelineBeatWidth: (arrangeTimelineBeatWidth: number) =>
    useWorkspaceStore.setState({ arrangeTimelineBeatWidth }),
  setArrangeTimelineSnapPreset: (arrangeTimelineSnapPreset: ArrangementSnapPreset) =>
    useWorkspaceStore.setState({ arrangeTimelineSnapPreset }),
  setSelectedEffectId: (selectedEffectId: string | null) =>
    useWorkspaceStore.setState({ selectedEffectId }),
  setSelectedLiveEffectId: (selectedLiveEffectId: string | null) =>
    useWorkspaceStore.setState({ selectedLiveEffectId }),
  setSelectedArrangeBuiltInCue: (selection: ArrangeBuiltInCueSelection | null) => {
    const current = useWorkspaceStore.getState().selectedArrangeBuiltInCue;
    if (
      current?.recipeRef.id !== selection?.recipeRef.id ||
      current?.recipeRef.revision !== selection?.recipeRef.revision ||
      current?.cue.compatible_stage_ref.id !== selection?.cue.compatible_stage_ref.id ||
      current?.cue.compatible_stage_ref.revision !== selection?.cue.compatible_stage_ref.revision
    ) {
      authoringTransportActions.pauseAll();
    }
    useWorkspaceStore.setState({
      selectedArrangeBuiltInCue: selection ? structuredClone(selection) : null,
    });
  },
  setLivePadQuantize: (livePadQuantize: LivePadQuantize) =>
    useWorkspaceStore.setState({ livePadQuantize }),
  setLivePadConfig: (effectId: string, config: LivePadConfig) =>
    useWorkspaceStore.setState((state) => ({
      livePadConfigs: { ...state.livePadConfigs, [effectId]: config },
    })),
  toggleFavoriteEffect: (effectId: string) =>
    useWorkspaceStore.setState((state) => ({
      favoriteEffectIds: state.favoriteEffectIds.includes(effectId)
        ? state.favoriteEffectIds.filter((id) => id !== effectId)
        : [...state.favoriteEffectIds, effectId],
    })),
  setPatchAddress: (index: number, address: PatchAddress) =>
    useWorkspaceStore.setState((state) => {
      const patchAddresses = [...state.patchAddresses];
      patchAddresses[index] = address;
      return { patchAddresses };
    }),
  setSnapshotState: (snapshot: ShowSnapshotState) =>
    useWorkspaceStore.setState({
      publishedRevision: snapshot.published_revision,
      liveRevision: snapshot.live_revision,
    }),
  setPublishedRevision: (publishedRevision: number | null) =>
    useWorkspaceStore.setState({ publishedRevision }),
  setPublishStatus: (publishStatus: PublishStatus, statusMessage: string | null = null) =>
    useWorkspaceStore.setState({ publishStatus, statusMessage }),
  resetAuthoringDefaults: () =>
    useWorkspaceStore.setState((state) => ({
      ...initialState,
      publishedRevision: state.publishedRevision,
      liveRevision: state.liveRevision,
      statusMessage: "Defaults restored. Click Live when you are ready to update output.",
    })),
  reset: () => useWorkspaceStore.setState(initialState, true),
};

export const workspaceSelectors = {
  activeWorkspace: (state: WorkspaceState) => state.activeWorkspace,
  advancedMode: (state: WorkspaceState) => state.advancedMode,
  libraryVisible: (state: WorkspaceState) => state.libraryVisible,
  inspectorVisible: (state: WorkspaceState) => state.inspectorVisible,
  arrangeTimelineFocus: (state: WorkspaceState) => state.arrangeTimelineFocus,
  arrangePreviewSize: (state: WorkspaceState) => state.arrangePreviewSize,
  arrangeTimelineBeatWidth: (state: WorkspaceState) => state.arrangeTimelineBeatWidth,
  arrangeTimelineSnapPreset: (state: WorkspaceState) => state.arrangeTimelineSnapPreset,
  selectedEffectId: (state: WorkspaceState) => state.selectedEffectId,
  selectedLiveEffectId: (state: WorkspaceState) => state.selectedLiveEffectId,
  selectedArrangeBuiltInCue: (state: WorkspaceState) => state.selectedArrangeBuiltInCue,
  favoriteEffectIds: (state: WorkspaceState) => state.favoriteEffectIds,
  livePadQuantize: (state: WorkspaceState) => state.livePadQuantize,
  livePadConfigs: (state: WorkspaceState) => state.livePadConfigs,
  patchAddresses: (state: WorkspaceState) => state.patchAddresses,
  publishedRevision: (state: WorkspaceState) => state.publishedRevision,
  liveRevision: (state: WorkspaceState) => state.liveRevision,
  publishStatus: (state: WorkspaceState) => state.publishStatus,
  statusMessage: (state: WorkspaceState) => state.statusMessage,
};
