import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authoringSessionKey, authoringTransportActions } from "@/authoring/transport";
import type {
  ArrangementDocument,
  AssetRef,
  CueDefinition,
  CueLayer,
  LayoutDefinition,
  ProjectBundle,
} from "@/bridge/types";
import {
  activeArrangementRef,
  appendExactRef,
  assetKey,
  bumpManifestRevision,
  createCueAsset,
  createEffectAsset,
  duplicateArrangementAsset,
  exactAsset,
  forkAssetRevision,
  uniqueId,
} from "@/document/projectModel";
import { migrateProjectBundle } from "@/document/projectMigration";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";

export type PreviewSourceMode = "authoring_draft" | "rehearsal_draft" | "rehearsal_published";

interface ProjectHistoryEntry {
  label: string;
  before: ProjectBundle;
  after: ProjectBundle;
}

export interface ProjectState {
  bundle: ProjectBundle;
  publishedBundle: ProjectBundle | null;
  selectedEffectRef: AssetRef | null;
  selectedLayoutRef: AssetRef;
  selectedCueRef: AssetRef | null;
  selectedArrangementRef: AssetRef;
  selectedTargetSetId: string;
  previewSource: PreviewSourceMode;
  liveViewMode: "live" | "rehearsal";
  rehearsalPublishedRevision: number | null;
  previewGeneration: number | null;
  previewError: string | null;
  history: ProjectHistoryEntry[];
  historyCursor: number;
  savedHistoryCursor: number;
}

const starter = createStarterProjectBundle();

const initialState: ProjectState = {
  bundle: starter,
  publishedBundle: null,
  selectedEffectRef: null,
  selectedLayoutRef: starter.manifest.layout_refs[0],
  selectedCueRef: null,
  selectedArrangementRef: activeArrangementRef(starter),
  selectedTargetSetId: "all",
  previewSource: "authoring_draft",
  liveViewMode: "live",
  rehearsalPublishedRevision: null,
  previewGeneration: null,
  previewError: null,
  history: [],
  historyCursor: 0,
  savedHistoryCursor: 0,
};

export const useProjectStore = create<ProjectState>()(
  persist(() => initialState, {
    name: "lumina-project-v1",
    version: 2,
    migrate: (persistedState) => {
      const state = persistedState as Partial<ProjectState>;
      const bundle = migrateProjectBundle(state.bundle ?? starter).bundle;
      return {
        ...initialState,
        ...state,
        bundle,
        selectedLayoutRef: state.selectedLayoutRef ?? bundle.manifest.layout_refs[0],
      } satisfies ProjectState;
    },
    partialize: (state) => ({
      bundle: state.bundle,
      selectedLayoutRef: state.selectedLayoutRef,
      selectedEffectRef: state.selectedEffectRef,
      selectedCueRef: state.selectedCueRef,
      selectedArrangementRef: state.selectedArrangementRef,
      selectedTargetSetId: state.selectedTargetSetId,
    }),
  }),
);

export const projectActions = {
  loadBundle: (bundle: ProjectBundle) => {
    authoringTransportActions.reset();
    const selectedArrangementRef = activeArrangementRef(bundle);
    useProjectStore.setState({
      ...initialState,
      bundle: structuredClone(bundle),
      selectedArrangementRef,
      selectedLayoutRef: bundle.manifest.layout_refs[0],
      selectedEffectRef:
        bundle.manifest.effect_refs[bundle.manifest.effect_refs.length - 1] ?? null,
      selectedCueRef: bundle.manifest.cue_refs[bundle.manifest.cue_refs.length - 1] ?? null,
    });
  },
  markPublished: () =>
    useProjectStore.setState((state) => ({
      publishedBundle: structuredClone(state.bundle),
      savedHistoryCursor: state.historyCursor,
    })),
  setSelectedEffectRef: (selectedEffectRef: AssetRef | null) =>
    useProjectStore.setState({ selectedEffectRef }),
  setSelectedLayoutRef: (selectedLayoutRef: AssetRef) =>
    useProjectStore.setState({ selectedLayoutRef }),
  duplicateLayout: (reference: AssetRef) => {
    let created = reference;
    transact("Duplicate Layout", (bundle, published) => {
      const source = exactAsset(bundle.layouts, reference);
      if (!source) throw new Error("Layout revision is missing");
      bumpManifestRevision(bundle, published);
      const name = uniqueLayoutName(
        `${source.name} Copy`,
        bundle.layouts.map((layout) => layout.name),
      );
      const copy = structuredClone(source);
      copy.id = uniqueId(
        slugLayoutName(name),
        bundle.layouts.map((layout) => layout.id),
      );
      copy.revision = 1;
      copy.name = name;
      bundle.layouts.push(copy);
      created = { id: copy.id, revision: copy.revision };
      appendExactRef(bundle.manifest.layout_refs, created);
    });
    useProjectStore.setState({ selectedLayoutRef: created });
    return created;
  },
  saveLayoutDraft: (reference: AssetRef, draft: LayoutDefinition) => {
    let selected = reference;
    transact("Save Layout Draft", (bundle, published) => {
      selected = forkAssetRevision(bundle, published, "layout", reference);
      const layout = exactAsset(bundle.layouts, selected);
      if (!layout) throw new Error("Layout revision is missing");
      layout.name = draft.name.trim();
      layout.category = draft.category;
      layout.editor = structuredClone(draft.editor);
      layout.geometry = structuredClone(draft.geometry);
      bumpManifestRevision(bundle, published);
    });
    useProjectStore.setState({ selectedLayoutRef: selected });
    return selected;
  },
  saveLayoutAs: (draft: LayoutDefinition, requestedName: string) => {
    let created: AssetRef | null = null;
    transact("Save Layout As", (bundle, published) => {
      bumpManifestRevision(bundle, published);
      const name = uniqueLayoutName(
        requestedName.trim() || `${draft.name} Copy`,
        bundle.layouts.map((layout) => layout.name),
      );
      const copy = structuredClone(draft);
      copy.id = uniqueId(
        slugLayoutName(name),
        bundle.layouts.map((layout) => layout.id),
      );
      copy.revision = 1;
      copy.name = name;
      bundle.layouts.push(copy);
      created = { id: copy.id, revision: copy.revision };
      appendExactRef(bundle.manifest.layout_refs, created);
    });
    if (!created) throw new Error("Layout could not be saved");
    useProjectStore.setState({ selectedLayoutRef: created });
    return created;
  },
  renameLayout: (reference: AssetRef, name: string) => {
    const layout = exactAsset(useProjectStore.getState().bundle.layouts, reference);
    if (!layout) throw new Error("Layout revision is missing");
    return projectActions.saveLayoutDraft(reference, { ...structuredClone(layout), name });
  },
  deleteLayout: (reference: AssetRef) => {
    const state = useProjectStore.getState();
    if (state.bundle.stages.some((stage) => assetKey(stage.layout_ref) === assetKey(reference))) {
      throw new Error("Layout revision is referenced by a Stage");
    }
    transact("Delete Layout", (bundle, published) => {
      bumpManifestRevision(bundle, published);
      bundle.manifest.layout_refs = bundle.manifest.layout_refs.filter(
        (candidate) => assetKey(candidate) !== assetKey(reference),
      );
      bundle.layouts = bundle.layouts.filter((layout) => assetKey(layout) !== assetKey(reference));
    });
    const bundle = useProjectStore.getState().bundle;
    const selectedLayoutRef = bundle.manifest.layout_refs[0];
    if (!selectedLayoutRef) throw new Error("Project requires at least one Layout");
    useProjectStore.setState({ selectedLayoutRef });
  },
  setSelectedCueRef: (selectedCueRef: AssetRef | null) =>
    useProjectStore.setState({ selectedCueRef }),
  setSelectedTargetSetId: (selectedTargetSetId: string) =>
    useProjectStore.setState({ selectedTargetSetId }),
  selectArrangement: (selectedArrangementRef: AssetRef) => {
    useProjectStore.setState({ selectedArrangementRef });
  },
  setPreviewSource: (
    previewSource: PreviewSourceMode,
    rehearsalPublishedRevision: number | null = null,
  ) => useProjectStore.setState({ previewSource, rehearsalPublishedRevision }),
  setLiveViewMode: (liveViewMode: "live" | "rehearsal") =>
    useProjectStore.setState({ liveViewMode }),
  setPreviewResult: (previewGeneration: number) =>
    useProjectStore.setState({ previewGeneration, previewError: null }),
  setPreviewError: (previewError: string) => useProjectStore.setState({ previewError }),
  createEffect: (name = "Pulse") => {
    let created: AssetRef | null = null;
    transact(`Create Effect ${name}`, (bundle, published) => {
      bumpManifestRevision(bundle, published);
      const effect = createEffectAsset(bundle, name);
      bundle.effects.push(effect);
      created = { id: effect.id, revision: effect.revision };
      appendExactRef(bundle.manifest.effect_refs, created);
    });
    useProjectStore.setState({ selectedEffectRef: created });
    return created;
  },
  renameEffect: (reference: AssetRef, name: string) => {
    let selected = reference;
    transact("Rename Effect", (bundle, published) => {
      selected = forkAssetRevision(bundle, published, "effect", reference);
      const effect = exactAsset(bundle.effects, selected);
      if (!effect) throw new Error("Effect revision is missing");
      effect.name = name.trim();
      bumpManifestRevision(bundle, published);
    });
    useProjectStore.setState({ selectedEffectRef: selected });
  },
  deleteEffect: (reference: AssetRef) => {
    const state = useProjectStore.getState();
    if (
      state.bundle.cues.some((cue) =>
        cue.layers.some((layer) => assetKey(layer.effect_ref) === assetKey(reference)),
      )
    ) {
      throw new Error("Effect revision is referenced by a Cue");
    }
    transact("Delete Effect", (bundle, published) => {
      bumpManifestRevision(bundle, published);
      bundle.manifest.effect_refs = bundle.manifest.effect_refs.filter(
        (candidate) => assetKey(candidate) !== assetKey(reference),
      );
      bundle.effects = bundle.effects.filter((effect) => assetKey(effect) !== assetKey(reference));
    });
    const bundle = useProjectStore.getState().bundle;
    useProjectStore.setState({
      selectedEffectRef:
        bundle.manifest.effect_refs[bundle.manifest.effect_refs.length - 1] ?? null,
    });
  },
  updateEffect: (
    reference: AssetRef,
    label: string,
    update: (effect: ProjectBundle["effects"][number]) => void,
  ) => {
    let selected = reference;
    transact(label, (bundle, published) => {
      selected = forkAssetRevision(bundle, published, "effect", reference);
      const effect = exactAsset(bundle.effects, selected);
      if (!effect) throw new Error("Effect revision is missing");
      update(effect);
      bumpManifestRevision(bundle, published);
    });
    useProjectStore.setState({ selectedEffectRef: selected });
  },
  createCue: (effectRefs: AssetRef[], name = "New Cue") => {
    let created: AssetRef | null = null;
    transact(`Create Cue ${name}`, (bundle, published) => {
      bumpManifestRevision(bundle, published);
      const cue = createCueAsset(bundle, effectRefs, name);
      bundle.cues.push(cue);
      created = { id: cue.id, revision: cue.revision };
      appendExactRef(bundle.manifest.cue_refs, created);
    });
    useProjectStore.setState({ selectedCueRef: created });
    return created;
  },
  duplicateCue: (reference: AssetRef) => {
    let created: AssetRef | null = null;
    transact("Duplicate Cue", (bundle, published) => {
      const cue = exactAsset(bundle.cues, reference);
      if (!cue) throw new Error("Cue revision is missing");
      bumpManifestRevision(bundle, published);
      const copy = createCueAsset(
        bundle,
        cue.layers.map((layer) => layer.effect_ref),
        `${cue.name} Copy`,
      );
      copy.nominal_length_ticks = cue.nominal_length_ticks;
      copy.layers = structuredClone(cue.layers);
      copy.layers.forEach((layer, index) => {
        layer.id = `${copy.id}-layer-${index + 1}`;
        layer.seed = stableSeed(`${copy.id}:${layer.id}`);
      });
      copy.automation_lanes = structuredClone(cue.automation_lanes ?? []);
      bundle.cues.push(copy);
      created = { id: copy.id, revision: copy.revision };
      appendExactRef(bundle.manifest.cue_refs, created);
    });
    useProjectStore.setState({ selectedCueRef: created });
    return created;
  },
  deleteCue: (reference: AssetRef) => {
    const state = useProjectStore.getState();
    if (
      state.bundle.arrangements.some((arrangement) =>
        arrangement.tracks.some((track) =>
          track.clips?.some((clip) => assetKey(clip.cue_ref) === assetKey(reference)),
        ),
      )
    ) {
      throw new Error("Cue revision is referenced by an Arrangement");
    }
    transact("Delete Cue", (bundle, published) => {
      bumpManifestRevision(bundle, published);
      bundle.manifest.cue_refs = bundle.manifest.cue_refs.filter(
        (candidate) => assetKey(candidate) !== assetKey(reference),
      );
      bundle.cues = bundle.cues.filter((cue) => assetKey(cue) !== assetKey(reference));
    });
    const bundle = useProjectStore.getState().bundle;
    useProjectStore.setState({
      selectedCueRef: bundle.manifest.cue_refs[bundle.manifest.cue_refs.length - 1] ?? null,
    });
  },
  renameCue: (reference: AssetRef, name: string) =>
    updateCue(reference, "Rename Cue", (cue) => {
      cue.name = name.trim();
    }),
  updateCueLayer: (reference: AssetRef, layerId: string, update: Partial<CueLayer>) =>
    updateCue(reference, "Update Cue layer", (cue) => {
      const layer = cue.layers.find((candidate) => candidate.id === layerId);
      if (!layer) throw new Error("Cue layer is missing");
      Object.assign(layer, structuredClone(update));
    }),
  addCueLayer: (reference: AssetRef, effectRef: AssetRef) =>
    updateCue(reference, "Add Cue layer", (cue, bundle) => {
      const stage = exactAsset(bundle.stages, cue.compatible_stage_ref);
      if (!stage) throw new Error("Cue Stage revision is missing");
      const layerId = `${effectRef.id}-layer-${cue.layers.length + 1}`;
      cue.layers.push({
        id: layerId,
        effect_ref: effectRef,
        target_set_ref: {
          stage_id: stage.id,
          stage_revision: stage.revision,
          target_set_id: stage.target_sets[0]?.id ?? "all",
        },
        parameter_overrides: {},
        phase: 0,
        seed: stableSeed(`${cue.id}:${layerId}`),
        layer: cue.layers.length,
        priority: 0,
        mix_overrides: [],
        trigger_policy: { mode: "timeline", quantize: "beat" },
      });
    }),
  removeCueLayer: (reference: AssetRef, layerId: string) =>
    updateCue(reference, "Remove Cue layer", (cue) => {
      if (cue.layers.length <= 1) throw new Error("A Cue requires at least one layer");
      cue.layers = cue.layers.filter((layer) => layer.id !== layerId);
    }),
  duplicateArrangement: (reference: AssetRef, name?: string) => {
    let created: AssetRef | null = null;
    transact("Duplicate Arrangement", (bundle, published) => {
      const arrangement = exactAsset(bundle.arrangements, reference);
      if (!arrangement) throw new Error("Arrangement revision is missing");
      bumpManifestRevision(bundle, published);
      const copy = duplicateArrangementAsset(bundle, arrangement, name);
      bundle.arrangements.push(copy);
      created = { id: copy.id, revision: copy.revision };
      appendExactRef(bundle.manifest.arrangement_refs, created);
      bundle.manifest.active_arrangement_id = copy.id;
    });
    useProjectStore.setState({ selectedArrangementRef: created ?? reference });
    return created;
  },
  createArrangement: (name = "New Arrangement") => {
    const source = useProjectStore.getState().selectedArrangementRef;
    let created: AssetRef | null = null;
    transact("Create Arrangement", (bundle, published) => {
      const arrangement = exactAsset(bundle.arrangements, source);
      if (!arrangement) throw new Error("Arrangement revision is missing");
      bumpManifestRevision(bundle, published);
      const next = duplicateArrangementAsset(bundle, arrangement, name);
      next.tracks = arrangement.tracks.map((track) => ({
        ...structuredClone(track),
        clips: [],
        automation_lanes: [],
      }));
      next.markers = [];
      bundle.arrangements.push(next);
      created = { id: next.id, revision: next.revision };
      appendExactRef(bundle.manifest.arrangement_refs, created);
      bundle.manifest.active_arrangement_id = next.id;
    });
    useProjectStore.setState({ selectedArrangementRef: created ?? source });
    return created;
  },
  renameArrangement: (reference: AssetRef, name: string) =>
    updateArrangement(reference, "Rename Arrangement", (arrangement) => {
      arrangement.name = name.trim();
    }),
  updateArrangement: (
    reference: AssetRef,
    label: string,
    update: (arrangement: ArrangementDocument) => void,
  ) => updateArrangement(reference, label, update),
  updateStage: (label: string, update: (stage: ProjectBundle["stages"][number]) => void) => {
    transact(label, (bundle, published) => {
      const reference = bundle.manifest.stage_ref;
      const selected = forkAssetRevision(bundle, published, "stage", reference);
      const stage = exactAsset(bundle.stages, selected);
      if (!stage) throw new Error("Stage revision is missing");
      update(stage);
      bumpManifestRevision(bundle, published);
    });
  },
  undo: () => {
    const state = useProjectStore.getState();
    if (state.historyCursor === 0) return;
    const historyCursor = state.historyCursor - 1;
    useProjectStore.setState({
      bundle: structuredClone(state.history[historyCursor].before),
      historyCursor,
    });
    repairSelections();
  },
  redo: () => {
    const state = useProjectStore.getState();
    if (state.historyCursor >= state.history.length) return;
    const historyCursor = state.historyCursor + 1;
    useProjectStore.setState({
      bundle: structuredClone(state.history[state.historyCursor].after),
      historyCursor,
    });
    repairSelections();
  },
  reset: () => {
    authoringTransportActions.reset();
    useProjectStore.setState(structuredClone(initialState), true);
  },
};

export const projectSelectors = {
  bundle: (state: ProjectState) => state.bundle,
  selectedEffectRef: (state: ProjectState) => state.selectedEffectRef,
  selectedLayoutRef: (state: ProjectState) => state.selectedLayoutRef,
  selectedCueRef: (state: ProjectState) => state.selectedCueRef,
  selectedArrangementRef: (state: ProjectState) => state.selectedArrangementRef,
  selectedTargetSetId: (state: ProjectState) => state.selectedTargetSetId,
  previewSource: (state: ProjectState) => state.previewSource,
  liveViewMode: (state: ProjectState) => state.liveViewMode,
  rehearsalPublishedRevision: (state: ProjectState) => state.rehearsalPublishedRevision,
  previewGeneration: (state: ProjectState) => state.previewGeneration,
  previewError: (state: ProjectState) => state.previewError,
  canUndo: (state: ProjectState) => state.historyCursor > 0,
  canRedo: (state: ProjectState) => state.historyCursor < state.history.length,
  isDirty: (state: ProjectState) => state.savedHistoryCursor !== state.historyCursor,
};

function transact(
  label: string,
  mutate: (bundle: ProjectBundle, published: ProjectBundle | null) => void,
) {
  const state = useProjectStore.getState();
  const before = structuredClone(state.bundle);
  const after = structuredClone(state.bundle);
  mutate(after, state.publishedBundle);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const history = state.history.slice(0, state.historyCursor);
  history.push({ label, before, after: structuredClone(after) });
  useProjectStore.setState({ bundle: after, history, historyCursor: history.length });
}

function updateCue(
  reference: AssetRef,
  label: string,
  update: (cue: CueDefinition, bundle: ProjectBundle) => void,
) {
  let selected = reference;
  transact(label, (bundle, published) => {
    selected = forkAssetRevision(bundle, published, "cue", reference);
    const cue = exactAsset(bundle.cues, selected);
    if (!cue) throw new Error("Cue revision is missing");
    update(cue, bundle);
    bumpManifestRevision(bundle, published);
  });
  useProjectStore.setState({ selectedCueRef: selected });
}

function updateArrangement(
  reference: AssetRef,
  label: string,
  update: (arrangement: ArrangementDocument) => void,
) {
  let selected = reference;
  transact(label, (bundle, published) => {
    selected = forkAssetRevision(bundle, published, "arrangement", reference);
    const arrangement = exactAsset(bundle.arrangements, selected);
    if (!arrangement) throw new Error("Arrangement revision is missing");
    update(arrangement);
    bundle.manifest.active_arrangement_id = arrangement.id;
    bumpManifestRevision(bundle, published);
  });
  useProjectStore.setState({ selectedArrangementRef: selected });
  if (assetKey(selected) !== assetKey(reference)) {
    authoringTransportActions.copySession(authoringSessionKey("arrangement", assetKey(reference)), {
      key: authoringSessionKey("arrangement", assetKey(selected)),
      scope: "arrangement",
      durationTicks:
        exactAsset(useProjectStore.getState().bundle.arrangements, selected)?.length_ticks ?? 1,
      clockSource: "arrangement",
    });
  }
}

function repairSelections() {
  const state = useProjectStore.getState();
  useProjectStore.setState({
    selectedEffectRef:
      exactAsset(state.bundle.effects, state.selectedEffectRef)?.id !== undefined
        ? state.selectedEffectRef
        : (state.bundle.manifest.effect_refs[state.bundle.manifest.effect_refs.length - 1] ?? null),
    selectedLayoutRef:
      exactAsset(state.bundle.layouts, state.selectedLayoutRef)?.id !== undefined
        ? state.selectedLayoutRef
        : (state.bundle.manifest.layout_refs[0] ?? state.bundle.stages[0].layout_ref),
    selectedCueRef:
      exactAsset(state.bundle.cues, state.selectedCueRef)?.id !== undefined
        ? state.selectedCueRef
        : (state.bundle.manifest.cue_refs[state.bundle.manifest.cue_refs.length - 1] ?? null),
    selectedArrangementRef:
      exactAsset(state.bundle.arrangements, state.selectedArrangementRef)?.id !== undefined
        ? state.selectedArrangementRef
        : activeArrangementRef(state.bundle),
  });
}

function stableSeed(value: string) {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function uniqueLayoutName(base: string, existing: string[]) {
  let candidate = base;
  let suffix = 2;
  while (existing.includes(candidate)) {
    candidate = `${base} ${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function slugLayoutName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "layout"
  );
}
