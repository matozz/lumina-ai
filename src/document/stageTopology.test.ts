import { describe, expect, it } from "vitest";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { fixtureIdsForStage } from "./layoutDefinition";
import { analyzeStageTopology, resolveTargetSet, stageForLayout } from "./stageTopology";
import { activeStage, exactAsset } from "./projectModel";

describe("Stage topology impact", () => {
  it("resolves the documented 20×20 quadrant and selected 4×4 area workflows", () => {
    const bundle = createStarterProjectBundle();
    const stage = activeStage(bundle);
    const layout = exactAsset(bundle.layouts, stage.layout_ref)!;
    const resolve = (id: string) =>
      resolveTargetSet(stage, layout, stage.target_sets.find((target) => target.id === id)!)!
        .fixtureIds;

    const quadrants = ["zone-2x2-1", "zone-2x2-2", "zone-2x2-3", "zone-2x2-4"].map(resolve);
    expect(quadrants.map((fixtures) => fixtures.length)).toEqual([100, 100, 100, 100]);
    expect(new Set(quadrants.flat()).size).toBe(400);

    const selectedAreas = ["zone-4x4-1", "zone-4x4-4", "zone-4x4-13", "zone-4x4-16"].map(resolve);
    expect(selectedAreas.map((fixtures) => fixtures.length)).toEqual([25, 25, 25, 25]);
    expect(new Set(selectedAreas.flat()).size).toBe(100);
  });

  it("materializes generated fixture counts from free Layout geometry", () => {
    const bundle = createStarterProjectBundle();
    const stage = activeStage(bundle);
    const strip = structuredClone(
      bundle.layouts.find((layout) => layout.geometry.shape === "strip")!,
    );
    if (strip.geometry.shape !== "strip") throw new Error("starter strip missing");
    strip.geometry.count = 123;

    const stripStage = stageForLayout(stage, strip);
    expect(fixtureIdsForStage(stripStage)).toHaveLength(123);
    expect(stripStage.patch).toEqual([{ profile_id: "generic-rgb", id_range: [1, 123] }]);

    const matrix = structuredClone(
      bundle.layouts.find((layout) => layout.geometry.shape === "matrix")!,
    );
    if (matrix.geometry.shape !== "matrix") throw new Error("starter matrix missing");
    matrix.geometry.rows = 3;
    matrix.geometry.columns = 4;
    expect(fixtureIdsForStage(stageForLayout(stage, matrix))).toHaveLength(12);
  });

  it("treats same-grid matrix to wall as compatible and reports every dependent boundary", () => {
    const bundle = createStarterProjectBundle();
    const stage = activeStage(bundle);
    bundle.cues.push({
      schema_version: 1,
      id: "cue",
      revision: 1,
      name: "Cue",
      compatible_stage_ref: bundle.manifest.stage_ref,
      nominal_length_ticks: 3_840,
      layers: [],
      automation_lanes: [],
      trigger_policy: { mode: "timeline", quantize: "beat" },
      capability_summary: { required_attributes: [] },
      risk_summary: { strobe_risk: "none" },
    });
    bundle.manifest.cue_refs.push({ id: "cue", revision: 1 });
    bundle.arrangements.find(
      (arrangement) => arrangement.id === bundle.manifest.active_arrangement_id,
    )!.tracks[0].clips = [
      {
        id: "clip",
        cue_ref: { id: "cue", revision: 1 },
        start_tick: 0,
        duration_tick: 3_840,
      },
    ];
    const wall = bundle.manifest.layout_refs.find(
      (reference) => reference.id === "builtin.layout.wall-main-20x20",
    )!;

    const impact = analyzeStageTopology(bundle, wall);

    expect(impact.compatible).toBe(true);
    expect(impact.groups).toEqual([
      expect.objectContaining({ id: "all-fixtures", fixtureCount: 400 }),
    ]);
    expect(impact.targetSets).toHaveLength(stage.target_sets.length);
    expect(impact.targetSets.every((target) => target.valid && !target.membershipChanged)).toBe(
      true,
    );
    expect(impact.cues).toHaveLength(bundle.cues.length);
    expect(impact.cues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Cue" }),
        expect.objectContaining({ name: "Quadrant Motion Dialogue", layers: 4 }),
      ]),
    );
    expect(impact.arrangements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "House 128", clipCount: 1 }),
        expect.objectContaining({ name: "Quadrant Motion · 128", clipCount: 2 }),
        expect.objectContaining({ name: "Four Corner Chase · 128", clipCount: 5 }),
      ]),
    );
  });

  it("requires remap when a grid TargetSet is applied to a circle", () => {
    const bundle = createStarterProjectBundle();
    const circle = bundle.manifest.layout_refs.find(
      (reference) => reference.id === "builtin.layout.circle-rings-8",
    )!;
    const impact = analyzeStageTopology(bundle, circle);
    const stage = activeStage(bundle);
    const circleLayout = exactAsset(bundle.layouts, circle)!;

    expect(impact.compatible).toBe(false);
    expect(impact.validTargetSetIds).toEqual(["all"]);
    expect(impact.fixtureCount).toBe(400);
    expect(impact.candidateCapacity).toBe(361);
    expect(impact.targetSets.find((target) => target.id === "all")).toMatchObject({
      beforeCount: 400,
      afterCount: 361,
    });
    expect(impact.targetSets.find((target) => target.id === "zones-3x3")).toMatchObject({
      valid: false,
    });
    expect(resolveTargetSet(stage, circleLayout, stage.target_sets[0])?.fixtureIds).toHaveLength(
      400,
    );
    expect(fixtureIdsForStage(stageForLayout(stage, circleLayout))).toHaveLength(361);
  });
});
