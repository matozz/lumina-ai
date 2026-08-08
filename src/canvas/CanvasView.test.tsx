import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayoutCoord } from "@/bridge/types";
import { CanvasView } from "./CanvasView";
import { publishLayoutPreview, publishProjectPreview, resetAuthoringPreview } from "./previewBus";

const rendererMocks = vi.hoisted(() => ({
  initFromLayout: vi.fn(),
  applyFrame: vi.fn(),
  startRenderLoop: vi.fn(),
  stopRenderLoop: vi.fn(),
}));

vi.mock("./CanvasRenderer", () => ({
  CanvasRenderer: class {
    initFromLayout = rendererMocks.initFromLayout;
    applyFrame = rendererMocks.applyFrame;
    startRenderLoop = rendererMocks.startRenderLoop;
    stopRenderLoop = rendererMocks.stopRenderLoop;
  },
}));

describe("CanvasView authoring preview replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthoringPreview();
  });

  it("replays a Layout preview published before the Canvas mounts", () => {
    const coords: LayoutCoord[] = [
      { id: 1, x: 10, y: 20, type: "pixel", width: 8, height: 8, patched: true },
    ];
    publishLayoutPreview(coords);

    render(<CanvasView frameSource="preview" />);

    expect(rendererMocks.initFromLayout).toHaveBeenCalledWith(coords, "layout-draft");
  });

  it("ignores a previous colored Project frame on a layout-only Stage canvas", () => {
    publishProjectPreview({
      generation: 1,
      source: { type: "authoring_draft" },
      context: { type: "stage" },
      project_ref: { id: "project", revision: 1 },
      stage_ref: { id: "stage", revision: 1 },
      arrangement_ref: { id: "arrangement", revision: 1 },
      playhead_tick: 0,
      layout_coords: [{ id: 1, x: 10, y: 20, type: "pixel", width: 8, height: 8, patched: true }],
      outputs: [],
    });

    render(<CanvasView frameSource="preview" layoutOnly />);

    expect(rendererMocks.initFromLayout).not.toHaveBeenCalled();
    expect(rendererMocks.applyFrame).not.toHaveBeenCalled();
  });
});
