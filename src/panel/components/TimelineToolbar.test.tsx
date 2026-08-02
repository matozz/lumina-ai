import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineActions, useEngineStore } from "@/stores/engine";
import { TimelineToolbar } from "./TimelineToolbar";

describe("TimelineToolbar musical time", () => {
  beforeEach(() => {
    useEngineStore.setState(useEngineStore.getInitialState(), true);
  });

  it("shows bar.beat.tick and seconds while tick remains the derived display value", () => {
    render(
      <TimelineToolbar
        canUndo={false}
        canRedo={false}
        isDirty={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
      />,
    );

    act(() => engineActions.setGlobalBeat(2));

    expect(screen.getByLabelText("Musical position").textContent).toBe("1.3.000");
    expect(screen.getByLabelText("Timeline seconds").textContent).toBe("0:01.000");
  });
});
