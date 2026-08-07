import { describe, expect, it } from "vitest";
import { activeLayout, activeStage } from "./projectModel";
import {
  circleRingFixtureCounts,
  circleRingRadii,
  diagnoseLayoutDefinition,
  fixtureIdsForStage,
  layoutCapacity,
  layoutPositions,
  layoutStageCapacityDiagnostic,
  previewBundleForLayout,
} from "./layoutDefinition";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";

describe("LayoutDefinition geometry", () => {
  it("keeps zero gap, fixture size, and pitch as separate validated metrics", () => {
    const bundle = createStarterProjectBundle();
    const stage = activeStage(bundle);
    const layout = structuredClone(activeLayout(bundle));
    if (layout.geometry.shape !== "matrix") throw new Error("starter matrix missing");
    layout.geometry.fixture_size = { width: 12, height: 18 };
    layout.geometry.gap = { x: 0, y: 0 };
    layout.geometry.pitch = { x: 12, y: 18 };

    expect(diagnoseLayoutDefinition(layout, fixtureIdsForStage(stage))).toEqual([]);
    expect(layoutPositions(layout, fixtureIdsForStage(stage))[11]).toEqual({
      id: 12,
      x: 12,
      y: 18,
    });

    layout.geometry.pitch.x = 13;
    expect(diagnoseLayoutDefinition(layout, fixtureIdsForStage(stage))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "LAYOUT_PITCH_MISMATCH" })]),
    );
  });

  it("covers matrix, strip, wall, frame, circle, and generated capacities", () => {
    const bundle = createStarterProjectBundle();
    expect(bundle.layouts.map(layoutCapacity)).toEqual([80, 85, 80, 80, 80, 80, 80]);
    const frame = bundle.layouts.find((layout) => layout.geometry.shape === "frame")!;
    expect(layoutPositions(frame, fixtureIdsForStage(activeStage(bundle)))).toHaveLength(80);
  });

  it("fills every circle ring symmetrically instead of leaving a partial outer arc", () => {
    const bundle = createStarterProjectBundle();
    const circle = bundle.layouts.find((layout) => layout.geometry.shape === "circle")!;
    if (circle.geometry.shape !== "circle") throw new Error("starter circle missing");
    const counts = circleRingFixtureCounts(80, circle.geometry.rings, circle.geometry.increment);
    const positions = layoutPositions(circle, fixtureIdsForStage(activeStage(bundle))).slice(1);

    expect(counts).toEqual([13, 26, 40]);
    const radii = circleRingRadii(counts, circle.geometry.ring_pitch);
    expect(radii.slice(1).every((radius, index) => radius - radii[index] >= 22)).toBe(true);
    expect(positions).toHaveLength(79);
    let offset = 0;
    for (const count of counts) {
      const ring = positions.slice(offset, offset + count);
      expect(ring.reduce((sum, point) => sum + point.x, 0) / count).toBeCloseTo(0, 10);
      expect(ring.reduce((sum, point) => sum + point.y, 0) / count).toBeCloseTo(0, 10);
      offset += count;
    }

    const allPositions = layoutPositions(circle, fixtureIdsForStage(activeStage(bundle)));
    const nearestDistance = allPositions.reduce(
      (minimum, point, index) =>
        Math.min(
          minimum,
          ...allPositions
            .slice(index + 1)
            .map((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y)),
        ),
      Number.POSITIVE_INFINITY,
    );
    expect(nearestDistance).toBeGreaterThanOrEqual(circle.geometry.ring_pitch - 0.000_001);
  });

  it("previews a Layout on a cloned Stage without mutating its saved reference", () => {
    const bundle = createStarterProjectBundle();
    const sourceStageRef = structuredClone(activeStage(bundle).layout_ref);
    const circle = bundle.layouts.find((layout) => layout.geometry.shape === "circle")!;
    const preview = previewBundleForLayout(bundle, circle);

    expect(activeStage(preview).layout_ref).toEqual({ id: circle.id, revision: circle.revision });
    expect(activeStage(bundle).layout_ref).toEqual(sourceStageRef);
  });

  it("keeps Layout asset validation separate from Stage patch capacity", () => {
    const bundle = createStarterProjectBundle();
    const stage = activeStage(bundle);
    const layout = structuredClone(activeLayout(bundle));
    if (layout.geometry.shape !== "matrix") throw new Error("starter matrix missing");
    layout.geometry.rows = 2;
    layout.geometry.columns = 2;

    expect(diagnoseLayoutDefinition(layout, fixtureIdsForStage(stage))).toEqual([]);
    expect(layoutStageCapacityDiagnostic(layout, fixtureIdsForStage(stage))).toMatchObject({
      code: "LAYOUT_CAPACITY_BELOW_STAGE_PATCH",
      severity: "warning",
    });
  });
});
