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
    layout.geometry.columns = 10;

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

  it("covers every supported Generator with practical built-in capacities", () => {
    const bundle = createStarterProjectBundle();
    expect(
      Object.fromEntries(bundle.layouts.map((layout) => [layout.id, layoutCapacity(layout)])),
    ).toMatchObject({
      "builtin.layout.matrix-main-20x20": 400,
      "builtin.layout.wall-main-20x20": 400,
      "builtin.layout.strip-runway-30": 30,
      "builtin.layout.frame-arena-12x24": 68,
      "builtin.layout.circle-rings-8": 361,
      "builtin.layout.sector-fan-8": 216,
      "builtin.layout.polygon-hex-96": 96,
      "builtin.layout.honeycomb-18x24": 432,
      "builtin.layout.formula-sine-160": 160,
      "builtin.layout.algorithm-lissajous-240": 240,
      "builtin.layout.strip-vertical-tower-30": 30,
      "builtin.layout.frame-proscenium-16x24": 76,
      "builtin.layout.frame-portrait-18x12": 56,
      "builtin.layout.circle-club-rings-6": 127,
      "builtin.layout.circle-festival-halo-10": 441,
      "builtin.layout.sector-front-wash-90": 110,
      "builtin.layout.sector-stage-wing-150": 135,
      "builtin.layout.polygon-triangle-84": 84,
      "builtin.layout.polygon-square-96": 96,
      "builtin.layout.polygon-pentagon-110": 110,
      "builtin.layout.honeycomb-compact-16x20": 320,
      "builtin.layout.honeycomb-loose-12x18": 216,
      "builtin.layout.formula-arch-160": 160,
    });
    const frame = bundle.layouts.find((layout) => layout.geometry.shape === "frame")!;
    expect(layoutPositions(frame, fixtureIdsForLayout(frame))).toHaveLength(68);
  });

  it("fills every circle ring symmetrically instead of leaving a partial outer arc", () => {
    const bundle = createStarterProjectBundle();
    const circle = bundle.layouts.find((layout) => layout.id === "builtin.layout.circle-rings-8")!;
    if (circle.geometry.shape !== "circle") throw new Error("starter circle missing");
    const ringPitch = circle.geometry.ring_pitch;
    const fixtureIds = fixtureIdsForLayout(circle);
    const counts = circleRingFixtureCounts(
      fixtureIds.length,
      circle.geometry.rings,
      circle.geometry.increment,
    );
    const positions = layoutPositions(circle, fixtureIds).slice(1);

    expect(counts).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(positions).toHaveLength(360);
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
    expect(nearestDistance).toBeGreaterThanOrEqual(circle.geometry.fixture_size.width - 0.000_001);
  });

  it("keeps dense Circle quantity independent from the saved ring gap", () => {
    const bundle = createStarterProjectBundle();
    const circle = bundle.layouts.find((layout) => layout.id === "builtin.layout.circle-rings-8")!;
    if (circle.geometry.shape !== "circle") throw new Error("starter circle missing");
    circle.geometry.rings = 3;
    circle.geometry.increment = 14;
    const spacing = [circle.geometry.ring_gap, circle.geometry.ring_pitch];

    expect(circleRingDensity(circle.geometry.increment)).toBe(14);
    expect(layoutCapacity(circle)).toBe(85);
    expect([circle.geometry.ring_gap, circle.geometry.ring_pitch]).toEqual(spacing);
    const positions = layoutPositions(circle, fixtureIdsForLayout(circle));
    const radii = [...new Set(positions.map((point) => Math.round(Math.hypot(point.x, point.y))))];
    expect(radii).toEqual([0, 30, 60, 90]);
  });

  it("previews a Layout on a cloned Stage without mutating its saved reference", () => {
    const bundle = createStarterProjectBundle();
    const sourceStageRef = structuredClone(activeStage(bundle).layout_ref);
    const circle = bundle.layouts.find((layout) => layout.id === "builtin.layout.circle-rings-8")!;
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
    expect(fixtureIdsForStage(stage)).toHaveLength(400);
    expect(fixtureIdsForLayout(layout)).toEqual([1, 2, 3, 4]);
    expect(layoutPositions(layout, fixtureIdsForLayout(layout))).toHaveLength(4);
  });

  it("resamples Algorithm paths by physical arc length", () => {
    const bundle = createStarterProjectBundle();
    for (const id of [
      "builtin.layout.algorithm-spiral-200",
      "builtin.layout.algorithm-lissajous-240",
    ]) {
      const layout = bundle.layouts.find((candidate) => candidate.id === id)!;
      const positions = layoutPositions(layout, fixtureIdsForLayout(layout));
      const distances = positions
        .slice(1)
        .map((position, index) =>
          Math.hypot(position.x - positions[index].x, position.y - positions[index].y),
        );
      if (layout.geometry.shape === "algorithm" && layout.geometry.algorithm === "lissajous") {
        distances.push(
          Math.hypot(
            positions[0].x - positions[positions.length - 1].x,
            positions[0].y - positions[positions.length - 1].y,
          ),
        );
      }
      const minimum = Math.min(...distances);
      const maximum = Math.max(...distances);
      expect(minimum).toBeGreaterThan(0);
      expect(maximum / minimum, id).toBeLessThan(1.08);
    }
  });
});
