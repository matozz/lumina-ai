import { describe, expect, it } from "vitest";
import { activeLayout, activeStage } from "./projectModel";
import {
  circleRingDensity,
  circleRingFixtureCounts,
  diagnoseLayoutDefinition,
  fixtureIdsForLayout,
  fixtureIdsForStage,
  layoutCapacity,
  layoutPositions,
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

    expect(diagnoseLayoutDefinition(layout)).toEqual([]);
    expect(layoutPositions(layout, fixtureIdsForStage(stage))[11]).toEqual({
      id: 12,
      x: 12,
      y: 18,
    });

    layout.geometry.pitch.x = 13;
    expect(diagnoseLayoutDefinition(layout)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "LAYOUT_PITCH_MISMATCH" })]),
    );
  });

  it("covers matrix, strip, wall, frame, circle, and generated capacities", () => {
    const bundle = createStarterProjectBundle();
    expect(bundle.layouts.map(layoutCapacity)).toEqual([80, 37, 80, 80, 80, 80, 80]);
    const frame = bundle.layouts.find((layout) => layout.geometry.shape === "frame")!;
    expect(layoutPositions(frame, fixtureIdsForLayout(frame))).toHaveLength(80);
  });

  it("fills every circle ring symmetrically instead of leaving a partial outer arc", () => {
    const bundle = createStarterProjectBundle();
    const circle = bundle.layouts.find((layout) => layout.geometry.shape === "circle")!;
    if (circle.geometry.shape !== "circle") throw new Error("starter circle missing");
    const ringPitch = circle.geometry.ring_pitch;
    const fixtureIds = fixtureIdsForLayout(circle);
    const counts = circleRingFixtureCounts(
      fixtureIds.length,
      circle.geometry.rings,
      circle.geometry.increment,
    );
    const positions = layoutPositions(circle, fixtureIds).slice(1);

    expect(counts).toEqual([6, 12, 18]);
    expect(positions).toHaveLength(36);
    let offset = 0;
    for (const [ringIndex, count] of counts.entries()) {
      const ring = positions.slice(offset, offset + count);
      expect(ring.reduce((sum, point) => sum + point.x, 0) / count).toBeCloseTo(0, 10);
      expect(ring.reduce((sum, point) => sum + point.y, 0) / count).toBeCloseTo(0, 10);
      expect(
        ring.every(
          (point) =>
            Math.abs(Math.hypot(point.x, point.y) - ringPitch * (ringIndex + 1)) < 0.000_001,
        ),
      ).toBe(true);
      offset += count;
    }

    const allPositions = layoutPositions(circle, fixtureIds);
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
    expect(nearestDistance).toBeGreaterThanOrEqual(ringPitch - 0.000_001);
  });

  it("safely converts legacy dense circles without making Rings change the gap", () => {
    const bundle = createStarterProjectBundle();
    const circle = bundle.layouts.find((layout) => layout.geometry.shape === "circle")!;
    if (circle.geometry.shape !== "circle") throw new Error("starter circle missing");
    circle.geometry.increment = 14;

    expect(circleRingDensity(circle.geometry.increment)).toBe(6);
    expect(layoutCapacity(circle)).toBe(37);
    const positions = layoutPositions(circle, fixtureIdsForLayout(circle));
    const radii = [...new Set(positions.map((point) => Math.round(Math.hypot(point.x, point.y))))];
    expect(radii).toEqual([0, 22, 44, 66]);
  });

  it("previews a Layout on a cloned Stage without mutating its saved reference", () => {
    const bundle = createStarterProjectBundle();
    const sourceStageRef = structuredClone(activeStage(bundle).layout_ref);
    const circle = bundle.layouts.find((layout) => layout.geometry.shape === "circle")!;
    const preview = previewBundleForLayout(bundle, circle);

    expect(activeStage(preview).layout_ref).toEqual({ id: circle.id, revision: circle.revision });
    expect(activeStage(bundle).layout_ref).toEqual(sourceStageRef);
  });

  it("generates Layout preview positions independently from the current Stage patch", () => {
    const bundle = createStarterProjectBundle();
    const stage = activeStage(bundle);
    const layout = structuredClone(activeLayout(bundle));
    if (layout.geometry.shape !== "matrix") throw new Error("starter matrix missing");
    layout.geometry.rows = 2;
    layout.geometry.columns = 2;

    expect(diagnoseLayoutDefinition(layout)).toEqual([]);
    expect(fixtureIdsForStage(stage)).toHaveLength(80);
    expect(fixtureIdsForLayout(layout)).toEqual([1, 2, 3, 4]);
    expect(layoutPositions(layout, fixtureIdsForLayout(layout))).toHaveLength(4);
  });
});
