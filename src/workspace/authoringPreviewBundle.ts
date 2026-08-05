import type {
  AssetRef,
  CueDefinition,
  EffectDefinitionDocument,
  ProductionCatalog,
  ProjectBundle,
} from "@/bridge/types";
import { appendExactRef, assetKey, exactAsset } from "@/document/projectModel";

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

  const next = structuredClone(bundle);
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
    bundle: next,
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
) {
  const next = structuredClone(bundle);
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
  let risk: CueDefinition["risk_summary"]["strobe_risk"] = "none";
  const rank = { none: 0, low: 1, medium: 2, high: 3 } as const;
  for (const layer of cue.layers) {
    const effect =
      exactAsset(bundle.effects, layer.effect_ref) ??
      exactAsset(catalog?.effects ?? [], layer.effect_ref);
    for (const attribute of effect?.catalog.required_attributes ?? []) required.add(attribute);
    const effectRisk = effect?.catalog.strobe_risk ?? "none";
    if (rank[effectRisk] > rank[risk]) risk = effectRisk;
  }
  cue.capability_summary.required_attributes = [...required].sort();
  cue.risk_summary.strobe_risk = risk;
}
