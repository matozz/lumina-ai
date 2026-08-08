import type { AssetRef } from "@/bridge/types";

export const INTERNAL_PRODUCTION_CUE_PREFIX = "__builtin-cue-";

export function productionRecipeCueBaseId(recipeId: string) {
  return recipeId.replace(/^recipe\./, "cue-").replace(/[^a-z0-9-]+/g, "-");
}

export function productionRecipeCueInternalId(
  recipeId: string,
  recipeRevision: number,
  stageRef: AssetRef,
) {
  const cueId = productionRecipeCueBaseId(recipeId).replace(/^cue-/, "");
  const stageId = stageRef.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return `${INTERNAL_PRODUCTION_CUE_PREFIX}${cueId}-v${recipeRevision}--${stageId}-r${stageRef.revision}`;
}

export function isInternalProductionCueId(cueId: string) {
  return cueId.startsWith(INTERNAL_PRODUCTION_CUE_PREFIX);
}
