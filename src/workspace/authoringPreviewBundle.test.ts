import { describe, expect, it } from "vitest";
import type { ProductionCatalog } from "@/bridge/types";
import { fixtureIdsForStage, layoutPositions } from "@/document/layoutDefinition";
import {
  activeLayout,
  activeStage,
  createCueAsset,
  createEffectAsset,
  exactAsset,
} from "@/document/projectModel";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import {
  materializeAuthoringPreview,
  materializeCueDraftBundle,
  materializeStagePreviewBundle,
} from "./authoringPreviewBundle";

describe("authoring preview materialization", () => {
  it("uses Last Known Good and leaves the persisted bundle untouched", () => {
    const bundle = createStarterProjectBundle();
    const persistedEffects = structuredClone(bundle.effects);
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
      layouts: [],
      arrangements: [],
      project_templates: [],
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
    expect(bundle.effects).toEqual(persistedEffects);
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

  it("isolates Effect authoring from unrelated project assets", () => {
    const bundle = createStarterProjectBundle();
    const effect = createEffectAsset(bundle, "Pulse");
    const unrelated = createEffectAsset(bundle, "Broken Effect");
    bundle.effects.push(effect, unrelated);
    bundle.manifest.effect_refs.push(effect, unrelated);
    const result = materializeAuthoringPreview(
      bundle,
      effect,
      null,
      { comparison: "working", effect: null, cue: null },
      null,
      { scope: "effect", arrangementRef: bundle.manifest.arrangement_refs[0] },
    );

    expect(result.bundle.effects.map((candidate) => candidate.id)).toEqual([effect.id]);
    expect(result.bundle.cues).toEqual([]);
    expect(result.bundle.arrangements[0].tracks.every((track) => track.clips?.length === 0)).toBe(
      true,
    );
    expect(result.bundle.manifest.effect_refs).toEqual([
      { id: effect.id, revision: effect.revision },
    ]);
  });

  it("validates a Cue against only its exact Effect dependencies", () => {
    const bundle = createStarterProjectBundle();
    const effect = createEffectAsset(bundle, "Pulse");
    const unrelated = createEffectAsset(bundle, "Broken Effect");
    bundle.effects.push(effect, unrelated);
    bundle.manifest.effect_refs.push(effect, unrelated);
    const cue = createCueAsset(bundle, [effect], "Focused Cue");

    const result = materializeCueDraftBundle(
      bundle,
      cue,
      null,
      bundle.manifest.arrangement_refs[0],
    );

    expect(result.cues).toEqual([cue]);
    expect(result.effects.map((candidate) => candidate.id)).toEqual([effect.id]);
    expect(result.manifest.cue_refs).toEqual([{ id: cue.id, revision: cue.revision }]);
    expect(result.arrangements[0].tracks.every((track) => track.clips?.length === 0)).toBe(true);
  });

  it("keeps Stage, Lab, Cue, and Arrange on the exact same Layout geometry", () => {
    const bundle = createStarterProjectBundle();
    const effect = createEffectAsset(bundle, "Cross-workspace pulse");
    bundle.effects.push(effect);
    bundle.manifest.effect_refs.push({ id: effect.id, revision: effect.revision });
    const cue = createCueAsset(bundle, [effect], "Cross-workspace cue");
    bundle.cues.push(cue);
    bundle.manifest.cue_refs.push({ id: cue.id, revision: cue.revision });
    const draft = { comparison: "working", effect: null, cue: null } as const;

    const previews = [
      materializeStagePreviewBundle(bundle),
      materializeAuthoringPreview(bundle, effect, null, draft, null, {
        scope: "effect",
        arrangementRef: bundle.manifest.arrangement_refs[0],
      }).bundle,
      materializeAuthoringPreview(bundle, effect, cue, draft, null, {
        scope: "cue",
        arrangementRef: bundle.manifest.arrangement_refs[0],
      }).bundle,
      materializeAuthoringPreview(bundle, effect, cue, draft, null).bundle,
    ];
    const geometries = previews.map((preview) => {
      const stage = activeStage(preview);
      return layoutPositions(activeLayout(preview), fixtureIdsForStage(stage));
    });

    expect(geometries.map((positions) => positions.length)).toEqual([400, 400, 400, 400]);
    expect(geometries.slice(1)).toEqual([geometries[0], geometries[0], geometries[0]]);
  });
});
