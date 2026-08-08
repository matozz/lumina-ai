import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTimelineGeometry } from "@/panel/timelineGeometry";
import { CueClipBlock } from "./CueClipBlock";

describe("CueClipBlock native pointer interaction", () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const flushFrame = () => {
    const callbacks = frames.splice(0);
    callbacks.forEach((callback) => callback(0));
  };

  it("batches pointer moves into DOM-only rAF preview and commits once on pointer up", () => {
    const onCommitMove = vi.fn();
    const onCommitResize = vi.fn();
    const viewportRef = createRef<HTMLDivElement>();
    const { container } = render(
      <div ref={viewportRef}>
        <CueClipBlock
          arrangementLength={30_720}
          clip={{
            id: "clip-a",
            cue_ref: { id: "cue-a", revision: 1 },
            start_tick: 960,
            duration_tick: 1_920,
          }}
          cueName="Cue A"
          geometry={createTimelineGeometry(960, 48)}
          onCommitMove={onCommitMove}
          onCommitResize={onCommitResize}
          onDelete={vi.fn()}
          onDuplicate={vi.fn()}
          onSelect={vi.fn()}
          onSnapPreview={vi.fn()}
          selected
          top={8}
          visualRow={0}
          viewportRef={viewportRef}
        />
      </div>,
    );
    const block = screen.getByRole("button", { name: /Cue A, starts at tick 960/ });

    fireEvent.pointerDown(block, { button: 0, pointerId: 7, clientX: 48 });
    fireEvent.pointerMove(block, { pointerId: 7, clientX: 59 });
    fireEvent.pointerMove(block, { pointerId: 7, clientX: 70 });
    fireEvent.pointerMove(block, { pointerId: 7, clientX: 74 });

    expect(frames).toHaveLength(1);
    expect(onCommitMove).not.toHaveBeenCalled();
    flushFrame();
    expect(block.style.transform).toContain("24px");
    expect(onCommitMove).not.toHaveBeenCalled();

    fireEvent.pointerUp(block, { pointerId: 7, clientX: 74 });
    expect(onCommitMove).toHaveBeenCalledOnce();
    expect(onCommitMove).toHaveBeenCalledWith(1_440);
    expect(block.style.transform).toBe("");

    const resizeHandle = container.querySelector<HTMLElement>("[data-resize-handle]")!;
    fireEvent.pointerDown(resizeHandle, { button: 0, pointerId: 8, clientX: 144 });
    fireEvent.pointerMove(block, { pointerId: 8, clientX: 168 });
    flushFrame();
    expect(onCommitResize).not.toHaveBeenCalled();
    fireEvent.pointerUp(block, { pointerId: 8, clientX: 168 });
    expect(onCommitResize).toHaveBeenCalledOnce();
    expect(onCommitResize).toHaveBeenCalledWith(2_400);
  });
});
