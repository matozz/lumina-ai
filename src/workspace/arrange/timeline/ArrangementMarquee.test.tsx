import { createRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTimelineGeometry } from "@/panel/timelineGeometry";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { ArrangementMarquee, marqueeAutoScrollDelta } from "./ArrangementMarquee";
import { createHouseArrangementReference } from "./houseArrangementReference";
import { EMPTY_ARRANGEMENT_SELECTION, arrangementSelectionFromItems } from "./arrangementSelection";

describe("Arrangement marquee auto-scroll", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("scrolls only inside the controlled viewport edge zones", () => {
    expect(marqueeAutoScrollDelta(100, 100, 500)).toBe(-18);
    expect(marqueeAutoScrollDelta(500, 100, 500)).toBe(18);
    expect(marqueeAutoScrollDelta(300, 100, 500)).toBe(0);
  });

  it("restores the gesture-start snapshot when Escape cancels a marquee", () => {
    const arrangement = createHouseArrangementReference();
    const snapshot = arrangementSelectionFromItems([
      { type: "clip", trackId: "cues", clipId: "full-fade" },
    ]);
    const viewportRef = createRef<HTMLDivElement>();
    const changes: (typeof snapshot)[] = [];
    let cancel: (() => void) | null = null;
    const { container } = render(
      <div ref={viewportRef}>
        <ArrangementMarquee
          arrangement={arrangement}
          bundle={createStarterProjectBundle()}
          geometry={createTimelineGeometry(arrangement.ppq, 4, 480)}
          selection={snapshot}
          viewportRef={viewportRef}
          onCancelReady={(next) => {
            cancel = next;
          }}
          onSelectionChange={(selection) => changes.push(selection)}
        >
          <div />
        </ArrangementMarquee>
      </div>,
    );
    const surface = container.querySelector<HTMLElement>("[data-arrangement-selection-surface]")!;

    fireEvent.pointerDown(surface, { button: 0, pointerId: 5, clientX: 280, clientY: 1 });
    fireEvent.pointerMove(surface, { pointerId: 5, clientX: 340, clientY: 60 });

    expect(changes[changes.length - 1]).not.toEqual(EMPTY_ARRANGEMENT_SELECTION);
    expect(cancel).not.toBeNull();
    (cancel as unknown as () => void)();
    expect(changes[changes.length - 1]).toEqual(snapshot);
  });
});
