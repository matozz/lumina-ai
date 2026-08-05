import type {
  EffectDefinitionDocument,
  LayoutDefinition,
  StageDocument,
  TargetSetDefinition,
} from "@/bridge/types";
import { resolveTargetSet } from "./stageTopology";

const BUILTIN_PROFILE_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  "generic-rgb": new Set(["intensity", "color.rgb"]),
  "generic-rgbw": new Set(["intensity", "color.rgb", "color.white"]),
  "generic-moving-head": new Set([
    "position.pan",
    "position.tilt",
    "intensity",
    "color.rgb",
    "beam.zoom",
    "beam.strobe",
    "beam.gobo",
  ]),
};

export interface EffectTargetCompatibility {
  compatible: boolean;
  fixtureCount: number;
  missingAttributes: string[];
  unknownProfileIds: string[];
}

export function effectTargetCompatibility(
  stage: StageDocument,
  layout: LayoutDefinition,
  target: TargetSetDefinition,
  effect: Pick<EffectDefinitionDocument, "catalog">,
): EffectTargetCompatibility {
  const resolved = resolveTargetSet(stage, layout, target);
  const fixtureIds = resolved?.fixtureIds ?? [];
  const missingAttributes = new Set<string>();
  const unknownProfileIds = new Set<string>();

  for (const fixtureId of fixtureIds) {
    const profileId = stage.patch.find(
      (patch) => fixtureId >= patch.id_range[0] && fixtureId <= patch.id_range[1],
    )?.profile_id;
    const attributes = profileId ? BUILTIN_PROFILE_ATTRIBUTES[profileId] : undefined;
    if (!attributes) {
      if (profileId) unknownProfileIds.add(profileId);
      for (const required of effect.catalog.required_attributes ?? []) {
        missingAttributes.add(required);
      }
      continue;
    }
    for (const required of effect.catalog.required_attributes ?? []) {
      if (!attributes.has(required)) missingAttributes.add(required);
    }
  }

  return {
    compatible: Boolean(resolved) && fixtureIds.length > 0 && missingAttributes.size === 0,
    fixtureCount: fixtureIds.length,
    missingAttributes: [...missingAttributes].sort(),
    unknownProfileIds: [...unknownProfileIds].sort(),
  };
}

export function friendlyEffectAttribute(attribute: string) {
  return (
    {
      "position.pan": "pan movement",
      "position.tilt": "tilt movement",
      "color.rgb": "RGB color",
      "color.white": "white channel",
      "beam.zoom": "zoom",
      "beam.strobe": "strobe",
      "beam.gobo": "gobo",
      intensity: "dimmer",
    }[attribute] ?? attribute
  );
}
