import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authoringSessionKey, authoringTransportActions } from "@/authoring/transport";
import { authoringDraftActions } from "@/stores/authoringDraft";
import type {
  ArrangementDocument,
  AssetRef,
  CueDefinition,
  CueLayer,
  EffectDefinitionDocument,
  GroupDSL,
  LayoutDefinition,
  ProjectBundle,
  ProjectPreviewFrame,
  TargetSetDefinition,
  TargetingSceneDefinition,
  UserAssetPack,
} from "@/bridge/types";
import {
  activeLayout,
  activeStage,
  activeArrangementRef,
  appendExactRef,
  assetKey,
  bumpManifestRevision,
  cloneAssetRevision,
  createCueAsset,
  createEffectAsset,
  duplicateArrangementAsset,
  exactAsset,
  forkAssetRevision,
  latestRefsById,
  normalizeProjectAssetRefs,
  toAssetRef,
  uniqueId,
} from "@/document/projectModel";
import { validateProjectBundle } from "@/document/projectBundle";
import {
  createBaseAssetPack,
  createUserAssetPack,
  importUserAssetPack,
  replaceProjectAssetsFromPack,
} from "@/document/userAssetPack";
import { layoutCapacity } from "@/document/layoutDefinition";
import { analyzeStageTopology, resolveTargetSet, stageForLayout } from "@/document/stageTopology";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { createOpaqueCueLayerId } from "@/document/cueLayerIdentity";

export const PREVIEW_DARK_FRAME_NOTICE_THRESHOLD = 45;

export type PreviewSourceMode = "authoring_draft" | "rehearsal_draft" | "rehearsal_published";

export interface StageLayoutUpgradeRequest {
  layoutRef: AssetRef;
  mode: "upgrade" | "remap" | "create_stage";
  targetMappings?: Record<string, string>;
  upgradeDependents: boolean;
}

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
  previewSummary: {
    fixtureCount: number;
    litFixtureCount: number;
    consecutiveDarkFrames: number;
  } | null;
  history: ProjectHistoryEntry[];
  historyCursor: number;
  savedHistoryCursor: number;
}

const starter = createStarterProjectBundle();
const LOCAL_WORKSPACE_STORAGE_VERSION = 15;

const initialState: ProjectState = {
  bundle: starter,
  publishedBundle: null,
  selectedEffectRef: null,
  selectedLayoutRef: structuredClone(starter.stages[0].layout_ref),
  selectedCueRef: null,
  selectedArrangementRef: activeArrangementRef(starter),
  selectedTargetSetId: "all",
  previewSource: "authoring_draft",
  liveViewMode: "live",
  rehearsalPublishedRevision: null,
  previewGeneration: null,
  previewError: null,
  previewSummary: null,
  history: [],
  historyCursor: 0,
  savedHistoryCursor: 0,
};

export const useProjectStore = create<ProjectState>()(
  persist(() => initialState, {
    name: "lumina-project-v1",
    version: LOCAL_WORKSPACE_STORAGE_VERSION,
    migrate: (persistedState, version) => {
      if (version < LOCAL_WORKSPACE_STORAGE_VERSION) return structuredClone(initialState);
      const state = persistedState as Partial<ProjectState>;
      const persistedBundle = structuredClone(state.bundle ?? starter);
      normalizeProjectAssetRefs(persistedBundle);
      const validation = validateProjectBundle(persistedBundle);
      const bundle = validation.success ? validation.data : createStarterProjectBundle();
      return {
        ...initialState,
        ...state,
        bundle,
        selectedLayoutRef: exactAsset(bundle.layouts, state.selectedLayoutRef ?? null)
          ? toAssetRef(state.selectedLayoutRef!)
          : structuredClone(activeStage(bundle).layout_ref),
        selectedEffectRef: exactAsset(bundle.effects, state.selectedEffectRef ?? null)
          ? toAssetRef(state.selectedEffectRef!)
          : null,
        selectedCueRef: exactAsset(bundle.cues, state.selectedCueRef ?? null)
          ? toAssetRef(state.selectedCueRef!)
          : null,
        selectedArrangementRef: exactAsset(
          bundle.arrangements,
          state.selectedArrangementRef ?? null,
        )
          ? toAssetRef(state.selectedArrangementRef!)
          : activeArrangementRef(bundle),
        selectedTargetSetId: state.selectedTargetSetId ?? "all",
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
    const loadedBundle = normalizeProjectAssetRefs(structuredClone(bundle));
    const selectedArrangementRef = activeArrangementRef(loadedBundle);
    useProjectStore.setState({
      ...initialState,
      bundle: loadedBundle,
      selectedArrangementRef,
      selectedLayoutRef: structuredClone(activeStage(loadedBundle).layout_ref),
      selectedEffectRef:
        loadedBundle.manifest.effect_refs[loadedBundle.manifest.effect_refs.length - 1] ?? null,
      selectedCueRef:
        loadedBundle.manifest.cue_refs[loadedBundle.manifest.cue_refs.length - 1] ?? null,
    });
  },
  renameProject: (name: string) => {
    const nextName = name.trim();
    if (!nextName) throw new Error("Project name cannot be empty");
    transact("Rename Project", (bundle, published) => {
      bundle.manifest.name = nextName;
      bumpManifestRevision(bundle, published);
    });
  },
  exportAssetPack: (name?: string) => createUserAssetPack(useProjectStore.getState().bundle, name),
  exportBaseAssetPack: () => createBaseAssetPack(),
  importAssetPack: (pack: UserAssetPack, onConflict: "reject" | "rename" = "reject") => {
    authoringTransportActions.pauseAll();
    let imported: ReturnType<typeof importUserAssetPack> | null = null;
    transact("Import asset pack", (bundle) => {
      imported = importUserAssetPack(bundle, pack, onConflict);
      Object.assign(bundle, imported.bundle);
    });
    if (!imported) throw new Error("Asset pack could not be imported");
    const result = imported as ReturnType<typeof importUserAssetPack>;
    const updates: Partial<ProjectState> = {};
    const layout = result.importedPack.layouts[result.importedPack.layouts.length - 1];
    const effect = [...result.importedPack.effects]
      .reverse()
      .find((candidate) => candidate.source === "project_local");
    const cue = result.importedPack.cues[result.importedPack.cues.length - 1];
    const arrangement =
      result.importedPack.arrangements[result.importedPack.arrangements.length - 1];
    if (layout) updates.selectedLayoutRef = toAssetRef(layout);
    if (effect) updates.selectedEffectRef = toAssetRef(effect);
    if (cue) updates.selectedCueRef = toAssetRef(cue);
    if (arrangement) updates.selectedArrangementRef = toAssetRef(arrangement);
    useProjectStore.setState(updates);
    return result;
  },
  replaceAssetPack: (pack: UserAssetPack) => {
    const current = useProjectStore.getState();
    const result = replaceProjectAssetsFromPack(current.bundle, pack);
    const bundle = normalizeProjectAssetRefs(result.bundle);
    const stage = activeStage(bundle);
    const selectedEffect = [...result.importedPack.effects]
      .reverse()
      .find((candidate) => candidate.source === "project_local");
    const selectedCue = result.importedPack.cues[result.importedPack.cues.length - 1];

    authoringTransportActions.reset();
    authoringDraftActions.reset();
    useProjectStore.setState(
      {
        ...structuredClone(initialState),
        bundle,
        publishedBundle: current.publishedBundle,
        selectedLayoutRef: structuredClone(stage.layout_ref),
        selectedEffectRef: selectedEffect ? toAssetRef(selectedEffect) : null,
        selectedCueRef: selectedCue ? toAssetRef(selectedCue) : null,
        selectedArrangementRef: activeArrangementRef(bundle),
        selectedTargetSetId:
          stage.target_sets.find((targetSet) => targetSet.id === "all")?.id ??
          stage.target_sets[0]?.id ??
          "all",
        history: [],
        historyCursor: 0,
        savedHistoryCursor: -1,
      },
      true,
    );
    return result;
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
      if (reference.id.startsWith("builtin.")) {
        const name = uniqueLayoutName(
          `${draft.name} Copy`,
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
        selected = toAssetRef(copy);
        appendExactRef(bundle.manifest.layout_refs, selected);
        bumpManifestRevision(bundle, published);
        return;
      }
      selected = bundle.stages.some((stage) => assetKey(stage.layout_ref) === assetKey(reference))
        ? cloneAssetRevision(bundle, "layout", reference)
        : forkAssetRevision(bundle, published, "layout", reference);
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
  useLayoutOnStage: (request: StageLayoutUpgradeRequest) => {
    const current = useProjectStore.getState();
    const impact = analyzeStageTopology(current.bundle, request.layoutRef);
    if (request.mode === "upgrade" && !impact.compatible) {
      throw new Error("Topology changed; choose an explicit TargetSet remap or create a new Stage");
    }
    let nextStageRef = current.bundle.manifest.stage_ref;
    let createdArrangementRef: AssetRef | null = null;
    const cueUpgrades = new Map<string, AssetRef>();
    const arrangementUpgrades = new Map<string, AssetRef>();
    transact("Use Layout on Stage", (bundle, published) => {
      const sourceStageRef = structuredClone(bundle.manifest.stage_ref);
      const sourceStage = exactAsset(bundle.stages, sourceStageRef);
      const layout = exactAsset(bundle.layouts, request.layoutRef);
      if (!sourceStage || !layout) throw new Error("Stage or Layout revision is missing");
      const targetMappings = request.targetMappings ?? {};

      if (request.mode === "create_stage") {
        const name = uniqueStageName(
          `${sourceStage.name} · ${layout.name}`,
          bundle.stages.map((stage) => stage.name),
        );
        const stage = structuredClone(sourceStage);
        stage.id = uniqueId(
          slugLayoutName(name),
          bundle.stages.map((candidate) => candidate.id),
        );
        stage.revision = 1;
        stage.name = name;
        bundle.stages.push(stage);
        nextStageRef = { id: stage.id, revision: stage.revision };
        bundle.manifest.stage_ref = nextStageRef;
        const sourceArrangement = exactAsset(bundle.arrangements, current.selectedArrangementRef);
        if (!sourceArrangement) throw new Error("Selected Arrangement revision is missing");
        const arrangementName = uniqueLayoutName(
          `${sourceArrangement.name} · ${layout.name}`,
          bundle.arrangements.map((arrangement) => arrangement.name),
        );
        const arrangement = structuredClone(sourceArrangement);
        arrangement.id = uniqueId(
          slugLayoutName(arrangementName),
          bundle.arrangements.map((candidate) => candidate.id),
        );
        arrangement.revision = 1;
        arrangement.name = arrangementName;
        arrangement.tracks = arrangement.tracks.map((track) => ({
          ...track,
          clips: [],
          automation_lanes: (track.automation_lanes ?? []).filter(
            (lane) => lane.target.scope === "global",
          ),
        }));
        bundle.arrangements.push(arrangement);
        createdArrangementRef = { id: arrangement.id, revision: arrangement.revision };
        appendExactRef(bundle.manifest.arrangement_refs, createdArrangementRef);
        bundle.manifest.active_arrangement_id = arrangement.id;
      } else {
        nextStageRef = cloneAssetRevision(bundle, "stage", sourceStageRef);
      }

      const nextStage = exactAsset(bundle.stages, nextStageRef);
      if (!nextStage) throw new Error("Upgraded Stage revision is missing");
      const materializedStage = stageForLayout(nextStage, layout);
      nextStage.layout_ref = materializedStage.layout_ref;
      nextStage.patch = materializedStage.patch;
      nextStage.groups = materializedStage.groups;
      nextStage.target_sets = materializedStage.target_sets;
      const validTargets = nextStage.target_sets.filter(
        (target) => resolveTargetSet(nextStage, layout, target) !== null,
      );
      if (validTargets.length === 0) throw new Error("Candidate Layout has no valid TargetSet");
      const validIds = new Set(validTargets.map((target) => target.id));
      for (const target of nextStage.target_sets) {
        if (validIds.has(target.id)) continue;
        const mapped = targetMappings[target.id];
        if (!mapped || !validIds.has(mapped)) {
          throw new Error(`TargetSet ${target.name} requires an explicit valid remap`);
        }
      }
      nextStage.target_sets = validTargets.map((target) => {
        const nextTarget = structuredClone(target);
        const selected = new Set(resolveTargetSet(nextStage, layout, nextTarget)?.fixtureIds ?? []);
        nextTarget.weights = (nextTarget.weights ?? []).filter((weight) =>
          selected.has(weight.fixture_id),
        );
        return nextTarget;
      });
      nextStage.targeting_scenes = (nextStage.targeting_scenes ?? []).map((scene) => ({
        ...scene,
        steps: scene.steps.map((step) => {
          const target_set_id =
            targetMappings[step.selection.target_set_id] ?? step.selection.target_set_id;
          const target = nextStage.target_sets.find((candidate) => candidate.id === target_set_id);
          const partitions = target
            ? (resolveTargetSet(nextStage, layout, target)?.partitions.length ?? 1)
            : 1;
          return {
            ...step,
            selection: {
              target_set_id,
              partition_index:
                step.selection.partition_index === null ||
                step.selection.partition_index === undefined ||
                partitions <= 1
                  ? null
                  : Math.min(step.selection.partition_index, partitions - 1),
            },
          };
        }),
      }));

      if (request.upgradeDependents && request.mode !== "create_stage") {
        const cueRefs = [...bundle.manifest.cue_refs];
        for (const cueRef of cueRefs) {
          const cue = exactAsset(bundle.cues, cueRef);
          if (!cue || assetKey(cue.compatible_stage_ref) !== assetKey(sourceStageRef)) continue;
          const nextCueRef = cloneAssetRevision(bundle, "cue", cueRef);
          const nextCue = exactAsset(bundle.cues, nextCueRef);
          if (!nextCue) throw new Error("Upgraded Cue revision is missing");
          nextCue.compatible_stage_ref = structuredClone(nextStageRef);
          nextCue.layers = nextCue.layers.map((layer) => ({
            ...layer,
            target_set_ref: {
              stage_id: nextStageRef.id,
              stage_revision: nextStageRef.revision,
              target_set_id:
                targetMappings[layer.target_set_ref.target_set_id] ??
                layer.target_set_ref.target_set_id,
            },
            targeting_scene_ref: layer.targeting_scene_ref
              ? {
                  ...layer.targeting_scene_ref,
                  stage_id: nextStageRef.id,
                  stage_revision: nextStageRef.revision,
                }
              : null,
          }));
          cueUpgrades.set(assetKey(cueRef), nextCueRef);
        }

        const arrangementRefs = [...bundle.manifest.arrangement_refs];
        for (const arrangementRef of arrangementRefs) {
          const arrangement = exactAsset(bundle.arrangements, arrangementRef);
          if (
            !arrangement?.tracks.some((track) =>
              track.clips?.some((clip) => cueUpgrades.has(assetKey(clip.cue_ref))),
            )
          ) {
            continue;
          }
          const nextArrangementRef = cloneAssetRevision(bundle, "arrangement", arrangementRef);
          const nextArrangement = exactAsset(bundle.arrangements, nextArrangementRef);
          if (!nextArrangement) throw new Error("Upgraded Arrangement revision is missing");
          for (const track of nextArrangement.tracks) {
            for (const clip of track.clips ?? []) {
              clip.cue_ref = cueUpgrades.get(assetKey(clip.cue_ref)) ?? clip.cue_ref;
            }
          }
          arrangementUpgrades.set(assetKey(arrangementRef), nextArrangementRef);
        }
      }
      bumpManifestRevision(bundle, published);
    });
    const nextStage = activeStage(useProjectStore.getState().bundle);
    const updates: Partial<ProjectState> = {
      selectedLayoutRef: request.layoutRef,
      selectedTargetSetId:
        nextStage.target_sets.find((target) => target.id === "all")?.id ??
        nextStage.target_sets[0]?.id ??
        "all",
    };
    const selectedCueRef = current.selectedCueRef
      ? cueUpgrades.get(assetKey(current.selectedCueRef))
      : null;
    if (selectedCueRef) updates.selectedCueRef = selectedCueRef;
    const selectedArrangementRef = arrangementUpgrades.get(
      assetKey(current.selectedArrangementRef),
    );
    if (selectedArrangementRef) updates.selectedArrangementRef = selectedArrangementRef;
    if (createdArrangementRef) updates.selectedArrangementRef = createdArrangementRef;
    useProjectStore.setState(updates);
    return { stageRef: nextStageRef, cueUpgrades, arrangementUpgrades };
  },
  setSelectedCueRef: (selectedCueRef: AssetRef | null) =>
    useProjectStore.setState({ selectedCueRef }),
  setSelectedTargetSetId: (selectedTargetSetId: string) =>
    useProjectStore.setState({ selectedTargetSetId }),
  duplicateTargetSet: (targetSetId: string) => {
    const state = useProjectStore.getState();
    const stage = exactAsset(state.bundle.stages, state.bundle.manifest.stage_ref);
    const source = stage?.target_sets.find((target) => target.id === targetSetId);
    if (!stage || !source) throw new Error("TargetSet is missing from the active Stage revision");
    const id = uniqueId(
      `${source.id}-copy`,
      stage.target_sets.map((target) => target.id),
    );
    const name = uniqueLayoutName(
      `${source.name} Copy`,
      stage.target_sets.map((target) => target.name),
    );
    updateActiveStageRevision("Duplicate TargetSet", (nextStage) => {
      nextStage.target_sets.push({ ...structuredClone(source), id, name });
    });
    useProjectStore.setState({ selectedTargetSetId: id });
    return id;
  },
  createTargetSet: () => {
    const state = useProjectStore.getState();
    const stage = exactAsset(state.bundle.stages, state.bundle.manifest.stage_ref);
    if (!stage) throw new Error("Active Stage revision is missing");
    const id = uniqueId(
      "target-set",
      stage.target_sets.map((target) => target.id),
    );
    const target: TargetSetDefinition = {
      id,
      name: uniqueLayoutName(
        "New TargetSet",
        stage.target_sets.map((candidate) => candidate.name),
      ),
      selector: { type: "all" },
      weights: [],
    };
    updateActiveStageRevision("Create TargetSet", (nextStage) => {
      nextStage.target_sets.push(target);
    });
    useProjectStore.setState({ selectedTargetSetId: id });
    return id;
  },
  saveTargetSet: (targetSetId: string, draft: TargetSetDefinition) => {
    updateActiveStageRevision("Save TargetSet", (stage) => {
      const index = stage.target_sets.findIndex((target) => target.id === targetSetId);
      if (index < 0) throw new Error("TargetSet is missing from the active Stage revision");
      stage.target_sets[index] = structuredClone(draft);
    });
    useProjectStore.setState({ selectedTargetSetId: draft.id });
  },
  deleteTargetSet: (targetSetId: string) => {
    const state = useProjectStore.getState();
    const stage = exactAsset(state.bundle.stages, state.bundle.manifest.stage_ref);
    if (!stage) throw new Error("Active Stage revision is missing");
    if (targetSetId === "all") throw new Error("The canonical All TargetSet cannot be deleted");
    const cueReferences = state.bundle.cues.filter(
      (cue) =>
        assetKey(cue.compatible_stage_ref) === assetKey(stage) &&
        cue.layers.some((layer) => layer.target_set_ref.target_set_id === targetSetId),
    );
    const sceneReferences = (stage.targeting_scenes ?? []).filter((scene) =>
      scene.steps.some((step) => step.selection.target_set_id === targetSetId),
    );
    if (cueReferences.length > 0 || sceneReferences.length > 0) {
      throw new Error(
        `TargetSet is referenced by ${cueReferences.length} Cue and ${sceneReferences.length} TargetingScene revisions`,
      );
    }
    updateActiveStageRevision("Delete TargetSet", (nextStage) => {
      nextStage.target_sets = nextStage.target_sets.filter((target) => target.id !== targetSetId);
    });
    const nextStage = activeStage(useProjectStore.getState().bundle);
    useProjectStore.setState({ selectedTargetSetId: nextStage.target_sets[0]?.id ?? "all" });
  },
  createStageGroup: () => {
    const stage = activeStage(useProjectStore.getState().bundle);
    const id = uniqueId(
      "fixture-group",
      stage.groups.map((group) => group.id),
    );
    const group: GroupDSL = {
      id,
      name: uniqueLayoutName(
        "New fixture group",
        stage.groups.map((candidate) => candidate.name),
      ),
      fixtures: [],
      sort_by: "none",
    };
    updateActiveStageRevision("Create fixture Group", (nextStage) => {
      nextStage.groups.push(group);
    });
    return id;
  },
  duplicateStageGroup: (groupId: string) => {
    const stage = activeStage(useProjectStore.getState().bundle);
    const source = stage.groups.find((group) => group.id === groupId);
    if (!source) throw new Error("Fixture Group is missing from the active Stage revision");
    const id = uniqueId(
      `${source.id}-copy`,
      stage.groups.map((group) => group.id),
    );
    const name = uniqueLayoutName(
      `${source.name} Copy`,
      stage.groups.map((group) => group.name),
    );
    updateActiveStageRevision("Duplicate fixture Group", (nextStage) => {
      nextStage.groups.push({ ...structuredClone(source), id, name });
    });
    return id;
  },
  saveStageGroup: (groupId: string, draft: GroupDSL) => {
    updateActiveStageRevision("Save fixture Group", (stage) => {
      const index = stage.groups.findIndex((group) => group.id === groupId);
      if (index < 0) throw new Error("Fixture Group is missing from the active Stage revision");
      stage.groups[index] = structuredClone(draft);
    });
  },
  deleteStageGroup: (groupId: string) => {
    if (groupId === "all-fixtures")
      throw new Error("The canonical fixture Group cannot be deleted");
    updateActiveStageRevision("Delete fixture Group", (stage) => {
      if (!stage.groups.some((group) => group.id === groupId)) {
        throw new Error("Fixture Group is missing from the active Stage revision");
      }
      stage.groups = stage.groups.filter((group) => group.id !== groupId);
    });
  },
  resizeActiveStagePatch: (fixtureCount: number) => {
    const current = useProjectStore.getState();
    const stage = activeStage(current.bundle);
    const layout = activeLayout(current.bundle);
    if (!Number.isInteger(fixtureCount) || fixtureCount < 1) {
      throw new Error("Stage patch fixture count must be a positive integer");
    }
    if (stage.patch.length !== 1) {
      throw new Error("Fixture count resize currently requires one contiguous Stage patch range");
    }
    const capacity = layoutCapacity(layout);
    if (fixtureCount > capacity) {
      throw new Error(
        `Active Layout provides ${capacity} positions; apply a larger Layout before patching ${fixtureCount} fixtures`,
      );
    }
    const [start] = stage.patch[0].id_range;
    const end = start + fixtureCount - 1;
    if (!Number.isSafeInteger(end) || end > 0xffff_ffff) {
      throw new Error("Stage patch fixture IDs exceed the supported range");
    }
    const validFixtureIds = new Set(
      Array.from({ length: fixtureCount }, (_, index) => start + index),
    );
    updateActiveStageRevision("Resize Stage patch", (nextStage) => {
      nextStage.patch[0]!.id_range = [start, end];
      nextStage.groups = nextStage.groups.map((group) => {
        if (group.id === "all-fixtures") {
          return { ...group, fixtures: { range: [start, end] as [number, number] } };
        }
        return {
          ...group,
          fixtures: fixtureIdsForGroup(group).filter((fixtureId) => validFixtureIds.has(fixtureId)),
        };
      });
      nextStage.target_sets = nextStage.target_sets.map((target) => ({
        ...target,
        selector:
          target.selector.type === "fixture_ids"
            ? {
                ...target.selector,
                fixture_ids: target.selector.fixture_ids.filter((fixtureId) =>
                  validFixtureIds.has(fixtureId),
                ),
              }
            : target.selector,
        weights: (target.weights ?? []).filter((weight) => validFixtureIds.has(weight.fixture_id)),
      }));
    });
    const nextStage = activeStage(useProjectStore.getState().bundle);
    useProjectStore.setState({
      selectedTargetSetId:
        nextStage.target_sets.find((target) => target.id === "all")?.id ??
        nextStage.target_sets[0]?.id ??
        "all",
    });
  },
  duplicateTargetingScene: (sceneId: string) => {
    const state = useProjectStore.getState();
    const stage = activeStage(state.bundle);
    const source = (stage.targeting_scenes ?? []).find((scene) => scene.id === sceneId);
    if (!source) throw new Error("TargetingScene is missing from the active Stage revision");
    const id = uniqueId(
      `${source.id}-copy`,
      (stage.targeting_scenes ?? []).map((scene) => scene.id),
    );
    const name = uniqueLayoutName(
      `${source.name} Copy`,
      (stage.targeting_scenes ?? []).map((scene) => scene.name),
    );
    updateActiveStageRevision("Duplicate TargetingScene", (nextStage) => {
      nextStage.targeting_scenes = [
        ...(nextStage.targeting_scenes ?? []),
        { ...structuredClone(source), id, name },
      ];
    });
    return id;
  },
  createTargetingScene: () => {
    const state = useProjectStore.getState();
    const stage = activeStage(state.bundle);
    const id = uniqueId(
      "targeting-scene",
      (stage.targeting_scenes ?? []).map((scene) => scene.id),
    );
    const scene: TargetingSceneDefinition = {
      id,
      name: uniqueLayoutName(
        "New TargetingScene",
        (stage.targeting_scenes ?? []).map((candidate) => candidate.name),
      ),
      looped: false,
      phase_continuity: true,
      steps: [
        {
          id: "all",
          selection: { target_set_id: stage.target_sets[0]?.id ?? "all" },
          duration: { value: 1, unit: "bar" },
          transition: { type: "hard" },
        },
      ],
    };
    updateActiveStageRevision("Create TargetingScene", (nextStage) => {
      nextStage.targeting_scenes = [...(nextStage.targeting_scenes ?? []), scene];
    });
    return id;
  },
  saveTargetingScene: (sceneId: string, draft: TargetingSceneDefinition) => {
    updateActiveStageRevision("Save TargetingScene", (stage) => {
      const scenes = stage.targeting_scenes ?? [];
      const index = scenes.findIndex((scene) => scene.id === sceneId);
      if (index < 0) throw new Error("TargetingScene is missing from the active Stage revision");
      scenes[index] = structuredClone(draft);
      stage.targeting_scenes = scenes;
    });
  },
  deleteTargetingScene: (sceneId: string) => {
    const state = useProjectStore.getState();
    const stage = activeStage(state.bundle);
    const references = state.bundle.cues.filter(
      (cue) =>
        assetKey(cue.compatible_stage_ref) === assetKey(stage) &&
        cue.layers.some((layer) => layer.targeting_scene_ref?.targeting_scene_id === sceneId),
    );
    if (references.length > 0) {
      throw new Error(`TargetingScene is referenced by ${references.length} Cue revisions`);
    }
    updateActiveStageRevision("Delete TargetingScene", (nextStage) => {
      nextStage.targeting_scenes = (nextStage.targeting_scenes ?? []).filter(
        (scene) => scene.id !== sceneId,
      );
    });
  },
  selectArrangement: (selectedArrangementRef: AssetRef) => {
    const current = useProjectStore.getState().selectedArrangementRef;
    if (assetKey(current) !== assetKey(selectedArrangementRef)) {
      authoringTransportActions.pauseAll();
    }
    useProjectStore.setState({ selectedArrangementRef });
  },
  setPreviewSource: (
    previewSource: PreviewSourceMode,
    rehearsalPublishedRevision: number | null = null,
  ) => useProjectStore.setState({ previewSource, rehearsalPublishedRevision }),
  setLiveViewMode: (liveViewMode: "live" | "rehearsal") =>
    useProjectStore.setState({ liveViewMode }),
  setPreviewResult: (frame: ProjectPreviewFrame) =>
    useProjectStore.setState((state) => {
      const litFixtureCount = frame.outputs.filter((output) =>
        output.attributes.some(
          (attribute) =>
            attribute.id === "intensity" &&
            attribute.value.type === "scalar" &&
            attribute.value.value > 0.01,
        ),
      ).length;
      const samePreview = state.previewGeneration === frame.generation;
      return {
        previewGeneration: frame.generation,
        previewError: null,
        previewSummary: {
          fixtureCount: frame.outputs.length,
          litFixtureCount,
          consecutiveDarkFrames:
            litFixtureCount === 0
              ? samePreview
                ? (state.previewSummary?.consecutiveDarkFrames ?? 0) + 1
                : 1
              : 0,
        },
      };
    }),
  setPreviewError: (previewError: string) =>
    useProjectStore.setState({ previewError, previewSummary: null }),
  createEffect: (name = "Pulse"): AssetRef | null => {
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
  saveEffectWorkingDraft: (draft: EffectDefinitionDocument) => {
    if (draft.source === "built_in") {
      throw new Error("Built-in Effects are read-only. Customize before saving.");
    }
    let selected: AssetRef = { id: draft.id, revision: draft.revision };
    let saved = structuredClone(draft);
    transact(`Save Effect ${draft.name}`, (bundle, published) => {
      const revisions = bundle.effects
        .filter((effect) => effect.id === draft.id)
        .map((effect) => effect.revision);
      saved = structuredClone(draft);
      saved.revision = revisions.length > 0 ? Math.max(...revisions) + 1 : 1;
      selected = { id: saved.id, revision: saved.revision };
      bundle.effects.push(saved);
      appendExactRef(bundle.manifest.effect_refs, selected);
      bumpManifestRevision(bundle, published);
    });
    useProjectStore.setState({ selectedEffectRef: selected });
    return structuredClone(saved);
  },
  createCue: (effectRefs: AssetRef[], name = "New Cue"): AssetRef | null => {
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
  duplicateCue: (reference: AssetRef): AssetRef | null => {
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
      const layerIdMap = new Map<string, string>();
      const occupiedLayerIds: string[] = [];
      copy.layers.forEach((layer, index) => {
        const sourceLayerId = layer.id;
        layer.id = createOpaqueCueLayerId(occupiedLayerIds);
        occupiedLayerIds.push(layer.id);
        layerIdMap.set(sourceLayerId, layer.id);
        layer.seed = stableSeed(`${copy.id}:${layer.id}`);
        layer.layer = index;
      });
      copy.automation_lanes = structuredClone(cue.automation_lanes ?? []);
      copy.automation_lanes.forEach((lane) => {
        const remappedLayerId = layerIdMap.get(lane.target.layer_id);
        if (remappedLayerId) lane.target.layer_id = remappedLayerId;
      });
      bundle.cues.push(copy);
      created = { id: copy.id, revision: copy.revision };
      appendExactRef(bundle.manifest.cue_refs, created);
    });
    useProjectStore.setState({ selectedCueRef: created });
    return created;
  },
  deleteCue: (reference: AssetRef, options?: { removeArrangementClips?: boolean }) => {
    const state = useProjectStore.getState();
    const isReferenced = state.bundle.arrangements.some((arrangement) =>
      arrangement.tracks.some((track) =>
        track.clips?.some((clip) => assetKey(clip.cue_ref) === assetKey(reference)),
      ),
    );
    if (isReferenced && !options?.removeArrangementClips) {
      throw new Error("Cue revision is referenced by an Arrangement");
    }
    transact("Delete Cue", (bundle, published) => {
      bumpManifestRevision(bundle, published);
      if (options?.removeArrangementClips) {
        for (const arrangement of bundle.arrangements) {
          for (const track of arrangement.tracks) {
            const removedClipIds = new Set(
              (track.clips ?? [])
                .filter((clip) => assetKey(clip.cue_ref) === assetKey(reference))
                .map((clip) => clip.id),
            );
            if (removedClipIds.size === 0) continue;
            track.clips = (track.clips ?? []).filter((clip) => !removedClipIds.has(clip.id));
            track.automation_lanes = (track.automation_lanes ?? []).filter(
              (lane) =>
                lane.target.scope !== "cue_layer" || !removedClipIds.has(lane.target.clip_id),
            );
          }
        }
      }
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
      const stableLayerId = layer.id;
      Object.assign(layer, structuredClone(update));
      layer.id = stableLayerId;
    }),
  addCueLayer: (reference: AssetRef, effectRef: AssetRef) =>
    updateCue(reference, "Add Cue layer", (cue, bundle) => {
      const stage = exactAsset(bundle.stages, cue.compatible_stage_ref);
      if (!stage) throw new Error("Cue Stage revision is missing");
      const layerId = createOpaqueCueLayerId(cue.layers.map((layer) => layer.id));
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
      cue.automation_lanes = (cue.automation_lanes ?? []).filter(
        (lane) => lane.target.layer_id !== layerId,
      );
    }),
  saveCueWorkingDraft: (
    draft: CueDefinition,
    productionEffects: EffectDefinitionDocument[] = [],
  ) => {
    let selected: AssetRef = { id: draft.id, revision: draft.revision };
    let saved = structuredClone(draft);
    transact(`Save Cue ${draft.name}`, (bundle, published) => {
      for (const effect of productionEffects) {
        const reference = { id: effect.id, revision: effect.revision };
        if (!exactAsset(bundle.effects, reference)) bundle.effects.push(structuredClone(effect));
        appendExactRef(bundle.manifest.effect_refs, reference);
      }
      const revisions = bundle.cues.filter((cue) => cue.id === draft.id).map((cue) => cue.revision);
      saved = structuredClone(draft);
      saved.revision = revisions.length > 0 ? Math.max(...revisions) + 1 : 1;
      selected = { id: saved.id, revision: saved.revision };
      bundle.cues.push(saved);
      appendExactRef(bundle.manifest.cue_refs, selected);
      bumpManifestRevision(bundle, published);
    });
    useProjectStore.setState({ selectedCueRef: selected });
    return structuredClone(saved);
  },
  duplicateArrangement: (reference: AssetRef, name?: string): AssetRef | null => {
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
  createArrangement: (name = "New Arrangement"): AssetRef | null => {
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
  deleteArrangement: (reference: AssetRef): AssetRef => {
    const state = useProjectStore.getState();
    const arrangementRefs = latestRefsById(state.bundle.manifest.arrangement_refs);
    const deletedIndex = arrangementRefs.findIndex((candidate) => candidate.id === reference.id);
    if (deletedIndex < 0 || !exactAsset(state.bundle.arrangements, reference)) {
      throw new Error("Arrangement revision is missing");
    }
    if (arrangementRefs.length <= 1) {
      throw new Error("A Project requires at least one Arrangement");
    }

    const remainingRefs = arrangementRefs.filter((candidate) => candidate.id !== reference.id);
    const selected = remainingRefs[Math.min(deletedIndex, remainingRefs.length - 1)];
    const bundle = structuredClone(state.bundle);
    bundle.manifest.arrangement_refs = bundle.manifest.arrangement_refs.filter(
      (candidate) => candidate.id !== reference.id,
    );
    bundle.arrangements = bundle.arrangements.filter(
      (arrangement) => arrangement.id !== reference.id,
    );
    bundle.manifest.active_arrangement_id = selected.id;
    bumpManifestRevision(bundle, state.publishedBundle);
    normalizeProjectAssetRefs(bundle);
    authoringTransportActions.pauseAll();
    useProjectStore.setState({
      bundle,
      selectedArrangementRef: selected,
      history: [],
      historyCursor: 0,
      savedHistoryCursor: -1,
    });
    return selected;
  },
  renameArrangement: (reference: AssetRef, name: string) =>
    updateArrangement(reference, "Rename Arrangement", (arrangement) => {
      arrangement.name = name.trim();
    }),
  updateArrangement: (
    reference: AssetRef,
    label: string,
    update: (arrangement: ArrangementDocument, bundle: ProjectBundle) => void,
  ) => updateArrangement(reference, label, update),
  updateStage: (label: string, update: (stage: ProjectBundle["stages"][number]) => void) =>
    updateActiveStageRevision(label, update),
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
  previewSummary: (state: ProjectState) => state.previewSummary,
  canUndo: (state: ProjectState) => state.historyCursor > 0,
  canRedo: (state: ProjectState) => state.historyCursor < state.history.length,
  isDirty: (state: ProjectState) => state.savedHistoryCursor !== state.historyCursor,
};

function transact(
  label: string,
  mutate: (bundle: ProjectBundle, published: ProjectBundle | null) => void,
) {
  const state = useProjectStore.getState();
  const before = normalizeProjectAssetRefs(structuredClone(state.bundle));
  const after = structuredClone(before);
  mutate(after, state.publishedBundle);
  normalizeProjectAssetRefs(after);
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
  update: (arrangement: ArrangementDocument, bundle: ProjectBundle) => void,
) {
  let selected = reference;
  transact(label, (bundle, published) => {
    if (reference.id.startsWith("builtin.")) {
      const source = exactAsset(bundle.arrangements, reference);
      if (!source) throw new Error("Arrangement revision is missing");
      const copy = duplicateArrangementAsset(bundle, source, `${source.name} Custom`);
      bundle.arrangements.push(copy);
      selected = toAssetRef(copy);
      appendExactRef(bundle.manifest.arrangement_refs, selected);
    } else {
      selected = forkAssetRevision(bundle, published, "arrangement", reference);
    }
    const arrangement = exactAsset(bundle.arrangements, selected);
    if (!arrangement) throw new Error("Arrangement revision is missing");
    update(arrangement, bundle);
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

function updateActiveStageRevision(
  label: string,
  update: (stage: ProjectBundle["stages"][number]) => void,
) {
  const current = useProjectStore.getState();
  const sourceStageRef = structuredClone(current.bundle.manifest.stage_ref);
  const cueUpgrades = new Map<string, AssetRef>();
  const arrangementUpgrades = new Map<string, AssetRef>();
  transact(label, (bundle, published) => {
    const nextStageRef = cloneAssetRevision(bundle, "stage", sourceStageRef);
    const nextStage = exactAsset(bundle.stages, nextStageRef);
    if (!nextStage) throw new Error("Upgraded Stage revision is missing");
    update(nextStage);

    const cueRefs = [...bundle.manifest.cue_refs];
    for (const cueRef of cueRefs) {
      const cue = exactAsset(bundle.cues, cueRef);
      if (!cue || assetKey(cue.compatible_stage_ref) !== assetKey(sourceStageRef)) continue;
      const nextCueRef = cloneAssetRevision(bundle, "cue", cueRef);
      const nextCue = exactAsset(bundle.cues, nextCueRef);
      if (!nextCue) throw new Error("Upgraded Cue revision is missing");
      nextCue.compatible_stage_ref = structuredClone(nextStageRef);
      nextCue.layers = nextCue.layers.map((layer) => ({
        ...layer,
        target_set_ref: {
          ...layer.target_set_ref,
          stage_id: nextStageRef.id,
          stage_revision: nextStageRef.revision,
        },
        targeting_scene_ref: layer.targeting_scene_ref
          ? {
              ...layer.targeting_scene_ref,
              stage_id: nextStageRef.id,
              stage_revision: nextStageRef.revision,
            }
          : null,
      }));
      cueUpgrades.set(assetKey(cueRef), nextCueRef);
    }

    const arrangementRefs = [...bundle.manifest.arrangement_refs];
    for (const arrangementRef of arrangementRefs) {
      const arrangement = exactAsset(bundle.arrangements, arrangementRef);
      if (
        !arrangement?.tracks.some((track) =>
          track.clips?.some((clip) => cueUpgrades.has(assetKey(clip.cue_ref))),
        )
      ) {
        continue;
      }
      const nextArrangementRef = cloneAssetRevision(bundle, "arrangement", arrangementRef);
      const nextArrangement = exactAsset(bundle.arrangements, nextArrangementRef);
      if (!nextArrangement) throw new Error("Upgraded Arrangement revision is missing");
      for (const track of nextArrangement.tracks) {
        for (const clip of track.clips ?? []) {
          clip.cue_ref = cueUpgrades.get(assetKey(clip.cue_ref)) ?? clip.cue_ref;
        }
      }
      arrangementUpgrades.set(assetKey(arrangementRef), nextArrangementRef);
    }
    bumpManifestRevision(bundle, published);
  });
  const updates: Partial<ProjectState> = {};
  const selectedCueRef = current.selectedCueRef
    ? cueUpgrades.get(assetKey(current.selectedCueRef))
    : null;
  if (selectedCueRef) updates.selectedCueRef = selectedCueRef;
  const selectedArrangementRef = arrangementUpgrades.get(assetKey(current.selectedArrangementRef));
  if (selectedArrangementRef) updates.selectedArrangementRef = selectedArrangementRef;
  useProjectStore.setState(updates);
}

function fixtureIdsForGroup(group: GroupDSL) {
  if (Array.isArray(group.fixtures)) return group.fixtures;
  const [start, end] = group.fixtures.range;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
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
    selectedArrangementRef: activeArrangementRef(state.bundle),
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

function uniqueStageName(base: string, existing: string[]) {
  return uniqueLayoutName(base, existing);
}
