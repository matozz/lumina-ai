import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasRenderer } from "./CanvasRenderer";

describe("CanvasRenderer frame budget", () => {
  let scheduled: FrameRequestCallback | undefined;
  const context = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    moveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalCompositeOperation: "source-over",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    scheduled = undefined;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        scheduled = callback;
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => vi.restoreAllMocks());

  it("draws only when layout, output, or viewport size becomes dirty", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 320,
      height: 180,
    } as DOMRect);
    const renderer = new CanvasRenderer(canvas);
    renderer.initFromLayout([{ id: 1, x: 0, y: 0, type: "pixel" }]);
    renderer.startRenderLoop();

    scheduled?.(0);
    const drawsAfterLayout = context.fillRect.mock.calls.length;
    expect(drawsAfterLayout).toBeGreaterThan(0);

    scheduled?.(16);
    expect(context.fillRect).toHaveBeenCalledTimes(drawsAfterLayout);

    renderer.applyFrame(
      [
        {
          id: 1,
          profile_id: "generic-rgb",
          attributes: [{ id: "intensity", value: { type: "scalar", value: 1 } }],
        },
      ],
      true,
    );
    scheduled?.(32);
    expect(context.fillRect.mock.calls.length).toBeGreaterThan(drawsAfterLayout);
  });

  it("draws the Layout fixture width and height instead of a fixed Canvas block", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 320,
      height: 180,
    } as DOMRect);
    const renderer = new CanvasRenderer(canvas);
    renderer.initFromLayout([{ id: 1, x: 20, y: 30, type: "pixel", width: 24, height: 10 }]);
    renderer.startRenderLoop();

    scheduled?.(0);
    expect(context.rect).toHaveBeenCalledWith(8, 25, 24, 10);
  });
});
