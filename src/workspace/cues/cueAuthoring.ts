import type {
  CueDefinition,
  CueLayer,
  Diagnostic,
  EffectDefinitionDocument,
  ProductionCatalog,
  ProjectBundle,
  StageDocument,
} from "@/bridge/types";
import {
  assetKey,
  exactAsset,
  latestRefsById,
  stableSeed,
  uniqueId,
} from "@/document/projectModel";

export type CueLayerUpdate = (layer: CueLayer, cue: CueDefinition) => void;

export function collectCueEffects(bundle: ProjectBundle, catalog: ProductionCatalog | null) {
  const effects = new Map<string, EffectDefinitionDocument>();
  for (const effect of catalog?.effects ?? []) effects.set(assetKey(effect), effect);
  for (const reference of latestRefsById(bundle.manifest.effect_refs)) {
    const effect = exactAsset(bundle.effects, reference);
    if (effect) effects.set(assetKey(effect), effect);
  }
  return [...effects.values()];
}

export function recomputeCueSummary(cue: CueDefinition, effects: EffectDefinitionDocument[]) {
  const required = new Set<string>();
  let risk: CueDefinition["risk_summary"]["strobe_risk"] = "none";
  for (const layer of cue.layers) {
    const effect = effects.find((candidate) => assetKey(candidate) === assetKey(layer.effect_ref));
    for (const attribute of effect?.catalog.required_attributes ?? []) required.add(attribute);
    if (riskRank(effect?.catalog.strobe_risk ?? "none") > riskRank(risk)) {
      risk = effect?.catalog.strobe_risk ?? risk;
    }
  }
  cue.capability_summary.required_attributes = [...required].sort();
  cue.risk_summary.strobe_risk = risk;
}

export function appendCueLayer(
  cue: CueDefinition,
  effect: EffectDefinitionDocument,
  stage: StageDocument,
) {
  const layerId = uniqueId(
    `${effect.id.replace(/[^a-z0-9-]+/g, "-")}-layer`,
    cue.layers.map((layer) => layer.id),
  );
  cue.layers.push({
    id: layerId,
    effect_ref: { id: effect.id, revision: effect.revision },
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
  return layerId;
}

export function removeCueLayer(cue: CueDefinition, layerId: string) {
  cue.layers = cue.layers.filter((layer) => layer.id !== layerId);
  cue.automation_lanes = (cue.automation_lanes ?? []).filter(
    (lane) => lane.target.layer_id !== layerId,
  );
}

export function cueDiagnosticsFrom(error: unknown, path = "cue"): Diagnostic[] {
  if (Array.isArray(error)) return error as Diagnostic[];
  return [cueDiagnostic(path, error instanceof Error ? error.message : String(error))];
}

export function cueDiagnostic(path: string, message: string): Diagnostic {
  return {
    code: "CUE_DRAFT_VALIDATION_FAILED",
    severity: "error",
    path,
    message,
    hint: "Keep editing; preview remains on the Last Known Good candidate.",
  };
}

function riskRank(risk: CueDefinition["risk_summary"]["strobe_risk"]) {
  return { none: 0, low: 1, medium: 2, high: 3 }[risk];
}
