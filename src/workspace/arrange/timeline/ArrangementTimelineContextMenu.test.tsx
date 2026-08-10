import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTimelineGeometry } from "@/panel/timelineGeometry";
import { CueRowContextMenu, timelineContextTick } from "./ArrangementTimelineContextMenu";

describe("Arrangement timeline context geometry", () => {
  it("maps a concrete pointer position and scroll offset to the current Snap", () => {
    const viewport = document.createElement("div");
    viewport.scrollLeft = 200;
    viewport.getBoundingClientRect = () =>
      ({ left: 100, right: 900, top: 0, bottom: 500, width: 800, height: 500 }) as DOMRect;
    const geometry = createTimelineGeometry(960, 48, 480);

    expect(timelineContextTick(124, viewport, geometry, 30_720)).toBe(4_320);
    expect(timelineContextTick(-1_000, viewport, geometry, 30_720)).toBe(0);
    expect(timelineContextTick(20_000, viewport, geometry, 30_720)).toBe(30_240);
  });

  it("offers Paste here at the concrete blank-row context tick", async () => {
    const viewportRef = createRef<HTMLDivElement>();
    const onPaste = vi.fn();
    const { container } = render(
      <div ref={viewportRef}>
        <CueRowContextMenu
          arrangementLength={30_720}
          canPlaceCue={false}
          clipboardKind="clips"
          geometry={createTimelineGeometry(960, 48, 480)}
          onCancelReady={vi.fn()}
          onPaste={onPaste}
          onPlaceCue={vi.fn()}
          viewportRef={viewportRef}
        >
          <div data-testid="cue-row" />
        </CueRowContextMenu>
      </div>,
    );
    const viewport = container.firstElementChild as HTMLDivElement;
    viewport.getBoundingClientRect = () =>
      ({ left: 0, right: 800, top: 0, bottom: 500, width: 800, height: 500 }) as DOMRect;

    fireEvent.contextMenu(screen.getByTestId("cue-row"), { clientX: 96, clientY: 40 });
    const pasteItem = await screen.findByRole("menuitem", { name: /Paste here/ });

    expect(pasteItem.tagName).toBe("BUTTON");
    expect(pasteItem.className).toContain("w-full");
    fireEvent.click(pasteItem);

    expect(onPaste).toHaveBeenCalledOnce();
    expect(onPaste).toHaveBeenCalledWith(1_920);
  });
});
