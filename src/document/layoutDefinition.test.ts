import { describe, expect, it } from "vitest";
import { activeLayout, activeStage } from "./projectModel";
import {
  diagnoseLayoutDefinition,
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

    expect(diagnoseLayoutDefinition(layout, fixtureIdsForStage(stage))).toEqual([]);
    expect(layoutPositions(layout, fixtureIdsForStage(stage))[5]).toEqual({ id: 6, x: 12, y: 18 });

    layout.geometry.pitch.x = 13;
    expect(diagnoseLayoutDefinition(layout, fixtureIdsForStage(stage))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "LAYOUT_PITCH_MISMATCH" })]),
    );
  });

  it("covers matrix, strip, wall, frame, circle, and generated capacities", () => {
    const bundle = createStarterProjectBundle();
    expect(bundle.layouts.map(layoutCapacity)).toEqual([16, 16, 16, 16, 16, 16, 16]);
    const frame = bundle.layouts.find((layout) => layout.geometry.shape === "frame")!;
    expect(layoutPositions(frame, fixtureIdsForStage(activeStage(bundle)))).toHaveLength(16);
  });

  it("previews a Layout on a cloned Stage without mutating its saved reference", () => {
    const bundle = createStarterProjectBundle();
    const sourceStageRef = structuredClone(activeStage(bundle).layout_ref);
    const circle = bundle.layouts.find((layout) => layout.geometry.shape === "circle")!;
    const preview = previewBundleForLayout(bundle, circle);

    expect(activeStage(preview).layout_ref).toEqual({ id: circle.id, revision: circle.revision });
    expect(activeStage(bundle).layout_ref).toEqual(sourceStageRef);
  });
});
