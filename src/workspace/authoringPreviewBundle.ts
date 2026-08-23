import type {
  AssetRef,
  CueDefinition,
  EffectDefinitionDocument,
  ProductionCatalog,
  ProjectBundle,
} from "@/bridge/types";
import {
  appendExactRef,
  assetKey,
  exactAsset,
  normalizeProjectAssetRefs,
} from "@/document/projectModel";

interface PreviewDraftState {
  effect: {
    pinned: EffectDefinitionDocument;
    lastKnownGood: EffectDefinitionDocument;
  } | null;
  cue: {
    pinned: CueDefinition;
    lastKnownGood: CueDefinition;
    mutedLayerIds: string[];
    soloLayerId: string | null;
  } | null;
  comparison: "pinned" | "working";
}

export interface AuthoringPreviewOptions {
  scope?: "effect" | "cue" | "stage";
  arrangementRef?: AssetRef | null;
}

export interface AuthoringPreviewMaterialization {
  bundle: ProjectBundle;
  effectRef: AssetRef | null;
  cueRef: AssetRef | null;
  effect: EffectDefinitionDocument | null;
  cue: CueDefinition | null;
}

export function materializeAuthoringPreview(
  bundle: ProjectBundle,
  selectedEffectRef: AssetRef | null,
  selectedCueRef: AssetRef | null,
  draft: PreviewDraftState,
  catalog: ProductionCatalog | null,
  options: AuthoringPreviewOptions = {},
): AuthoringPreviewMaterialization {
  const effectSessionMatches =
    selectedEffectRef &&
    draft.effect &&
    assetKey(draft.effect.pinned) === assetKey(selectedEffectRef);
  const cueSessionMatches =
    selectedCueRef && draft.cue && assetKey(draft.cue.pinned) === assetKey(selectedCueRef);
  const selectedCatalogEffect = exactAsset(catalog?.effects ?? [], selectedEffectRef);
  const selectedProjectEffect = exactAsset(bundle.effects, selectedEffectRef);
  const effect = effectSessionMatches
    ? structuredClone(
        draft.comparison === "pinned" ? draft.effect!.pinned : draft.effect!.lastKnownGood,
      )
    : structuredClone(selectedProjectEffect ?? selectedCatalogEffect ?? null);
  const pinnedCue = exactAsset(bundle.cues, selectedCueRef);
  let cue = cueSessionMatches
    ? structuredClone(draft.comparison === "pinned" ? draft.cue!.pinned : draft.cue!.lastKnownGood)
    : structuredClone(pinnedCue ?? null);

  if (cue && cueSessionMatches && draft.comparison === "working") {
    const visibleLayers = draft.cue!.soloLayerId
      ? cue.layers.filter((layer) => layer.id === draft.cue!.soloLayerId)
      : cue.layers.filter((layer) => !draft.cue!.mutedLayerIds.includes(layer.id));
    if (visibleLayers.length > 0) {
      cue.layers = visibleLayers;
      recomputePreviewCueSummary(cue, bundle, catalog);
    }
  }

  const next = normalizeProjectAssetRefs(structuredClone(bundle));
  if (effect) upsertEffect(next, effect);
  if (cue) {
    for (const layer of cue.layers) {
      const productionEffect = exactAsset(catalog?.effects ?? [], layer.effect_ref);
      if (productionEffect) upsertEffect(next, productionEffect);
    }
    const cueIndex = next.cues.findIndex(
      (candidate) => candidate.id === cue!.id && candidate.revision === cue!.revision,
    );
    if (cueIndex >= 0) next.cues[cueIndex] = cue;
    else next.cues.push(cue);
    appendExactRef(next.manifest.cue_refs, { id: cue.id, revision: cue.revision });
  }

  return {
    bundle: options.scope
      ? isolateAuthoringBundle(next, options.scope, effect, cue, options.arrangementRef)
      : next,
    effectRef: effect ? { id: effect.id, revision: effect.revision } : selectedEffectRef,
    cueRef: cue ? { id: cue.id, revision: cue.revision } : selectedCueRef,
    effect,
    cue,
  };
}

export function materializeCueDraftBundle(
  bundle: ProjectBundle,
  cue: CueDefinition,
  catalog: ProductionCatalog | null,
  arrangementRef?: AssetRef | null,
) {
  const next = normalizeProjectAssetRefs(structuredClone(bundle));
  for (const layer of cue.layers) {
    const productionEffect = exactAsset(catalog?.effects ?? [], layer.effect_ref);
    if (productionEffect) upsertEffect(next, productionEffect);
  }
  const index = next.cues.findIndex(
    (candidate) => candidate.id === cue.id && candidate.revision === cue.revision,
  );
  if (index >= 0) next.cues[index] = structuredClone(cue);
  else next.cues.push(structuredClone(cue));
  appendExactRef(next.manifest.cue_refs, { id: cue.id, revision: cue.revision });
  return isolateAuthoringBundle(next, "cue", null, cue, arrangementRef);
}

export function materializeStagePreviewBundle(
  bundle: ProjectBundle,
  arrangementRef?: AssetRef | null,
) {
  return isolateAuthoringBundle(bundle, "stage", null, null, arrangementRef);
}

function isolateAuthoringBundle(
  bundle: ProjectBundle,
  scope: NonNullable<AuthoringPreviewOptions["scope"]>,
  effect: EffectDefinitionDocument | null,
  cue: CueDefinition | null,
  arrangementRef?: AssetRef | null,
) {
  const next = normalizeProjectAssetRefs(structuredClone(bundle));
  const stageRef = cue?.compatible_stage_ref ?? next.manifest.stage_ref;
  const stage = exactAsset(next.stages, stageRef);
  const layout = stage ? exactAsset(next.layouts, stage.layout_ref) : null;
  const selectedArrangementRef =
    arrangementRef ??
    next.manifest.arrangement_refs.find(
      (reference) => reference.id === next.manifest.active_arrangement_id,
    ) ??
    null;
  const arrangement = exactAsset(next.arrangements, selectedArrangementRef);

  next.stages = stage ? [stage] : [];
  next.layouts = layout ? [layout] : [];
  next.arrangements = arrangement
    ? [
        {
          ...arrangement,
          tracks: arrangement.tracks.map((track) => ({
            ...track,
            automation_lanes: [],
            clips: [],
          })),
        },
      ]
    : [];

  if (scope === "cue" && cue) {
    next.cues = [cue];
    const effectKeys = new Set(cue.layers.map((layer) => assetKey(layer.effect_ref)));
    next.effects = next.effects.filter((candidate) => effectKeys.has(assetKey(candidate)));
  } else if (scope === "effect" && effect) {
    next.cues = [];
    next.effects = next.effects.filter((candidate) => assetKey(candidate) === assetKey(effect));
  } else {
    next.cues = [];
    next.effects = [];
  }

  next.manifest.stage_ref = { id: stageRef.id, revision: stageRef.revision };
  next.manifest.layout_refs = layout ? [{ id: layout.id, revision: layout.revision }] : [];
  next.manifest.arrangement_refs = arrangement
    ? [{ id: arrangement.id, revision: arrangement.revision }]
    : [];
  next.manifest.active_arrangement_id = arrangement?.id ?? next.manifest.active_arrangement_id;
  next.manifest.cue_refs = next.cues.map(({ id, revision }) => ({ id, revision }));
  next.manifest.effect_refs = next.effects.map(({ id, revision }) => ({ id, revision }));
  return next;
}

function upsertEffect(bundle: ProjectBundle, effect: EffectDefinitionDocument) {
  const index = bundle.effects.findIndex(
    (candidate) => candidate.id === effect.id && candidate.revision === effect.revision,
  );
  if (index >= 0) bundle.effects[index] = structuredClone(effect);
  else bundle.effects.push(structuredClone(effect));
  appendExactRef(bundle.manifest.effect_refs, { id: effect.id, revision: effect.revision });
}

function recomputePreviewCueSummary(
  cue: CueDefinition,
  bundle: ProjectBundle,
  catalog: ProductionCatalog | null,
) {
  const required = new Set<string>();
  for (const layer of cue.layers) {
    const effect =
      exactAsset(bundle.effects, layer.effect_ref) ??
      exactAsset(catalog?.effects ?? [], layer.effect_ref);
    for (const attribute of effect?.catalog.required_attributes ?? []) required.add(attribute);
  }
  cue.capability_summary.required_attributes = [...required].sort();
}
