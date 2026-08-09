import type { CueDefinition, ProjectBundle } from "@/bridge/types";
import { exactAsset } from "@/document/projectModel";

export interface CueLayerPresentation {
  effectName: string;
  index: number;
  layerLabel: string;
  targetSetName: string | null;
}

export function cueLayerPresentation(
  bundle: ProjectBundle,
  cue: CueDefinition,
  layerId: string,
): CueLayerPresentation | undefined {
  const index = cue.layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return undefined;
  const layer = cue.layers[index];
  const effect = exactAsset(bundle.effects, layer.effect_ref);
  const effectName = effect?.name ?? "Effect";
  const targetSetName = targetSetDisplayName(bundle, layer.target_set_ref);
  const fallback = `Layer ${index + 1}`;
  if (cue.layers.length === 1) {
    return { effectName, index, layerLabel: fallback, targetSetName };
  }

  const targetLabel = targetSetName ?? fallback;
  const peers = cue.layers.map((candidate, candidateIndex) => ({
    index: candidateIndex,
    effectName: exactAsset(bundle.effects, candidate.effect_ref)?.name ?? "Effect",
    targetSetName: targetSetDisplayName(bundle, candidate.target_set_ref),
  }));
  const matchingTargets = peers.filter(
    (candidate) => (candidate.targetSetName ?? `Layer ${candidate.index + 1}`) === targetLabel,
  );
  if (matchingTargets.length === 1) {
    return { effectName, index, layerLabel: targetLabel, targetSetName };
  }
  const matchingEffects = matchingTargets.filter(
    (candidate) => candidate.effectName === effectName,
  );
  const layerLabel =
    matchingEffects.length === 1
      ? `${targetLabel} · ${effectName}`
      : `${targetLabel} · ${effectName} · ${fallback}`;
  return { effectName, index, layerLabel, targetSetName };
}

export function arrangementAutomationDisplayLabel(
  bundle: ProjectBundle,
  cue: CueDefinition,
  layerId: string,
  parameterName: string,
) {
  if (cue.layers.length === 1) return `${cue.name} · ${parameterName}`;
  const presentation = cueLayerPresentation(bundle, cue, layerId);
  return presentation
    ? `${cue.name} · ${presentation.layerLabel} · ${parameterName}`
    : `${cue.name} · ${parameterName}`;
}

function targetSetDisplayName(
  bundle: ProjectBundle,
  reference: CueDefinition["layers"][number]["target_set_ref"],
) {
  const stage = exactAsset(bundle.stages, {
    id: reference.stage_id,
    revision: reference.stage_revision,
  });
  return (
    stage?.target_sets.find((targetSet) => targetSet.id === reference.target_set_id)?.name ?? null
  );
}
