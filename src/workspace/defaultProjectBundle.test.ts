import { describe, expect, it } from "vitest";
import { validateProjectBundle } from "@/document/projectBundle";
import { activeLayout, activeStage, exactAsset } from "@/document/projectModel";
import { resolveTargetSet } from "@/document/stageTopology";
import { isOpaqueCueLayerId } from "@/document/cueLayerIdentity";
import { createStarterProjectBundle } from "./defaultProjectBundle";

describe("Authoring Starter ProjectBundle", () => {
  it("keeps committed built-in Cue Layer identities opaque and stable across builds", () => {
    const first = createStarterProjectBundle();
    const second = createStarterProjectBundle();
    const identities = (bundle: ReturnType<typeof createStarterProjectBundle>) =>
      bundle.cues.map((cue) => ({
        cue: `${cue.id}@${cue.revision}`,
        layers: cue.layers.map((layer) => layer.id),
      }));

    expect(identities(first)).toEqual(identities(second));
    expect(
      first.cues.flatMap((cue) => cue.layers).every((layer) => isOpaqueCueLayerId(layer.id)),
    ).toBe(true);
  });

  it("materializes dependency-complete multi-region Arrangement examples", () => {
    const bundle = createStarterProjectBundle();

    expect(validateProjectBundle(bundle).success).toBe(true);
    expect(bundle.manifest.active_arrangement_id).toBe("builtin.arrangement.house-128");
    expect(bundle.arrangements.map((arrangement) => arrangement.id)).toEqual(
      expect.arrayContaining([
        "builtin.arrangement.house-128",
        "builtin.arrangement.quadrant-motion-128",
        "builtin.arrangement.four-corner-chase-128",
      ]),
    );
    expect(
      bundle.arrangements.every((arrangement) => arrangement.tempo_map.points[0].bpm === 128),
    ).toBe(true);

    for (const cue of bundle.cues) {
      expect(exactAsset(bundle.stages, cue.compatible_stage_ref)).toBeDefined();
      for (const layer of cue.layers) {
        expect(exactAsset(bundle.effects, layer.effect_ref)).toBeDefined();
        expect(
          bundle.stages.some(
            (stage) =>
              stage.id === layer.target_set_ref.stage_id &&
              stage.revision === layer.target_set_ref.stage_revision &&
              stage.target_sets.some(
                (targetSet) => targetSet.id === layer.target_set_ref.target_set_id,
              ),
          ),
        ).toBe(true);
      }
    }
    for (const arrangement of bundle.arrangements) {
      for (const clip of arrangement.tracks.flatMap((track) => track.clips ?? [])) {
        expect(exactAsset(bundle.cues, clip.cue_ref)).toBeDefined();
        expect("target_set_ref" in clip).toBe(false);
      }
    }
  });

  it("targets four 10×10 quadrants and four selected 5×5 corner regions", () => {
    const bundle = createStarterProjectBundle();
    const stage = activeStage(bundle);
    const layout = activeLayout(bundle);
    const fixtureCount = (targetSetId: string) => {
      const targetSet = stage.target_sets.find((candidate) => candidate.id === targetSetId)!;
      return resolveTargetSet(stage, layout, targetSet)!.fixtureIds.length;
    };

    expect([1, 2, 3, 4].map((index) => fixtureCount(`zone-2x2-${index}`))).toEqual([
      100, 100, 100, 100,
    ]);
    expect([1, 4, 13, 16].map((index) => fixtureCount(`zone-4x4-${index}`))).toEqual([
      25, 25, 25, 25,
    ]);
  });
});
