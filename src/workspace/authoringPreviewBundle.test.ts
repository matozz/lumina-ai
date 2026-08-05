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
    expect(result.bundle.manifest.effect_refs).toContainEqual({
      id: lkg.id,
      revision: lkg.revision,
    });
    expect(
      Object.keys(
        result.bundle.manifest.effect_refs[result.bundle.manifest.effect_refs.length - 1],
      ),
    ).toEqual(["id", "revision"]);
    expect(bundle.effects).toHaveLength(0);
  });

  it("applies Cue mute and solo only to the preview copy", () => {
    const bundle = createStarterProjectBundle();
    const effect = createEffectAsset(bundle, "Pulse");
    effect.catalog.required_attributes = ["intensity"];
    effect.catalog.strobe_risk = "low";
    const colorEffect = structuredClone(effect);
    colorEffect.id = "color-pulse";
    colorEffect.name = "Color Pulse";
    colorEffect.catalog.required_attributes = ["color.rgb"];
    colorEffect.catalog.strobe_risk = "high";
    bundle.effects.push(effect, colorEffect);
    bundle.manifest.effect_refs.push({ id: effect.id, revision: effect.revision });
    bundle.manifest.effect_refs.push({ id: colorEffect.id, revision: colorEffect.revision });
    const cue = createCueAsset(bundle, [effect, colorEffect], "Layered Cue");

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
    expect(result.cue?.capability_summary.required_attributes).toEqual(["color.rgb"]);
    expect(result.cue?.risk_summary.strobe_risk).toBe("high");
    expect(
      Object.keys(result.bundle.manifest.cue_refs[result.bundle.manifest.cue_refs.length - 1]),
    ).toEqual(["id", "revision"]);
    expect(cue.layers).toHaveLength(2);
  });
});
