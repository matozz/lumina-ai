import { describe, expect, it } from "vitest";
import type { ProductionCatalog } from "@/bridge/types";
import { createCueAsset, createEffectAsset, exactAsset } from "@/document/projectModel";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { materializeAuthoringPreview } from "./authoringPreviewBundle";

describe("authoring preview materialization", () => {
  it("uses Last Known Good and leaves the persisted bundle untouched", () => {
    const bundle = createStarterProjectBundle();
    const pinned = createEffectAsset(bundle, "Pulse");
    pinned.id = "builtin.intensity.pulse";
    pinned.source = "built_in";
    const lkg = structuredClone(pinned);
    lkg.id = "custom-pulse";
    lkg.source = "project_local";
    lkg.name = "Safe custom pulse";
    const catalog: ProductionCatalog = {
      schema_version: 1,
      effects: [pinned],
      cue_recipes: [],
    };

    const result = materializeAuthoringPreview(
      bundle,
      pinned,
      null,
      {
        comparison: "working",
        effect: { pinned, lastKnownGood: lkg },
        cue: null,
      },
      catalog,
    );

    expect(result.effect?.name).toBe("Safe custom pulse");
    expect(exactAsset(result.bundle.effects, lkg)).toBeDefined();
    expect(bundle.effects).toHaveLength(0);
  });

  it("applies Cue mute and solo only to the preview copy", () => {
    const bundle = createStarterProjectBundle();
    const effect = createEffectAsset(bundle, "Pulse");
    bundle.effects.push(effect);
    bundle.manifest.effect_refs.push(effect);
    const cue = createCueAsset(bundle, [effect, effect], "Layered Cue");

    const result = materializeAuthoringPreview(
      bundle,
      effect,
      cue,
      {
        comparison: "working",
        effect: null,
        cue: {
          pinned: cue,
          lastKnownGood: cue,
          mutedLayerIds: [],
          soloLayerId: cue.layers[1].id,
        },
      },
      null,
    );

    expect(result.cue?.layers.map((layer) => layer.id)).toEqual([cue.layers[1].id]);
    expect(cue.layers).toHaveLength(2);
  });
});
