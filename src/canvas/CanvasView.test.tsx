import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayoutCoord, ProjectPreviewFrame } from "@/bridge/types";
import { CanvasView } from "./CanvasView";
import {
  latestAuthoringPreview,
  publishLayoutPreview,
  publishProjectPreview,
  resetAuthoringPreview,
} from "./previewBus";

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
    publishProjectPreview(projectFrame(1, fixtureCoords()));

    render(<CanvasView frameSource="preview" layoutOnly />);

    expect(rendererMocks.initFromLayout).not.toHaveBeenCalled();
    expect(rendererMocks.applyFrame).not.toHaveBeenCalled();
  });

  it("reuses the compiled layout across incremental frames in one preview generation", () => {
    render(<CanvasView frameSource="preview" />);

    publishProjectPreview(projectFrame(1, fixtureCoords(), 0));
    publishProjectPreview(projectFrame(1, [], 16));

    expect(rendererMocks.initFromLayout).toHaveBeenCalledTimes(1);
    expect(rendererMocks.initFromLayout).toHaveBeenLastCalledWith(fixtureCoords());
    expect(rendererMocks.applyFrame).toHaveBeenCalledTimes(2);
    expect(latestProjectFrame()?.layout_coords).toEqual(fixtureCoords());

    const nextCoords = [{ ...fixtureCoords()[0], x: 40 }];
    publishProjectPreview(projectFrame(2, nextCoords, 32));
    expect(rendererMocks.initFromLayout).toHaveBeenCalledTimes(2);
    expect(rendererMocks.initFromLayout).toHaveBeenLastCalledWith(nextCoords);
  });

  it("restores Project geometry after a Layout draft replaces the canvas", () => {
    render(<CanvasView frameSource="preview" />);
    const projectCoords = fixtureCoords();

    publishProjectPreview(projectFrame(1, projectCoords));
    publishLayoutPreview([{ ...projectCoords[0], x: 80 }]);
    publishProjectPreview(projectFrame(1, [], 16));

    expect(rendererMocks.initFromLayout).toHaveBeenCalledTimes(3);
    expect(rendererMocks.initFromLayout).toHaveBeenLastCalledWith(projectCoords);
  });
});

function fixtureCoords(): LayoutCoord[] {
  return [{ id: 1, x: 10, y: 20, type: "pixel", width: 8, height: 8, patched: true }];
}

function projectFrame(
  generation: number,
  layoutCoords: LayoutCoord[],
  playheadTick = 0,
): ProjectPreviewFrame {
  return {
    generation,
    source: { type: "authoring_draft" },
    context: { type: "stage" },
    project_ref: { id: "project", revision: 1 },
    stage_ref: { id: "stage", revision: 1 },
    arrangement_ref: { id: "arrangement", revision: 1 },
    playhead_tick: playheadTick,
    layout_coords: layoutCoords,
    outputs: [],
  };
}

function latestProjectFrame() {
  const snapshot = latestAuthoringPreview();
  return snapshot?.type === "project" ? snapshot.frame : null;
}
