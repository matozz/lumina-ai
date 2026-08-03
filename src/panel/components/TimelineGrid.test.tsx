import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineActions, useEngineStore } from "@/stores/engine";
import { TimelineGrid } from "./TimelineGrid";
import { createTimelineGeometry } from "../timelineGeometry";

describe("TimelineGrid", () => {
  beforeEach(() => useEngineStore.setState(useEngineStore.getInitialState(), true));

  it("renders only viewport bar labels over a CSS-backed grid", () => {
    const { container } = render(
      <TimelineGrid
        geometry={createTimelineGeometry(960, 40)}
        viewport={{ startBeat: 500, endBeat: 546 }}
        maxBeat={600}
        onSeek={vi.fn()}
      />,
    );

    expect(container.querySelectorAll("[data-bar-beat]").length).toBeLessThanOrEqual(14);
    expect((container.firstElementChild as HTMLElement).style.backgroundImage).toContain(
      "linear-gradient",
    );
  });

  it("seeks from pointer position and provides snapped keyboard alternatives", () => {
    const onSeek = vi.fn();
    render(
      <TimelineGrid
        geometry={createTimelineGeometry(960, 40)}
        viewport={{ startBeat: 0, endBeat: 40 }}
        maxBeat={64}
        onSeek={onSeek}
      />,
    );
    const ruler = screen.getByRole("slider", { name: "Seek timeline" });
    vi.spyOn(ruler, "getBoundingClientRect").mockReturnValue({
      bottom: 27,
      height: 27,
      left: 10,
      right: 2_570,
      top: 0,
      width: 2_560,
      x: 10,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(ruler, { button: 0, clientX: 110 });
    expect(onSeek).toHaveBeenLastCalledWith(3);
    expect(document.activeElement).toBe(ruler);

    act(() => engineActions.setGlobalBeat(5));
    expect(ruler.getAttribute("aria-valuenow")).toBe("5");
    expect(ruler.getAttribute("aria-valuetext")).toBe("Beat 5");

    fireEvent.keyDown(ruler, { key: "ArrowRight" });
    fireEvent.keyDown(ruler, { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(ruler, { key: "Home" });
    fireEvent.keyDown(ruler, { key: "End" });
    expect(onSeek.mock.calls.slice(-4)).toEqual([[6], [1], [0], [64]]);
  });
});
