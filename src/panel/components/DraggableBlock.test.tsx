import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineActionContext, type TimelineActions } from "../context/TimelineContext";
import { DraggableBlock } from "./DraggableBlock";

function renderBlock() {
  const actions: TimelineActions = {
    onDragStart: vi.fn(),
    onResizeStart: vi.fn(),
    onDelete: vi.fn(),
    onNudge: vi.fn(),
    onUpdateAnimation: vi.fn(),
    onGridClick: vi.fn(),
  };
  render(
    <TimelineActionContext.Provider value={actions}>
      <DraggableBlock
        beatWidth={40}
        event={{
          id: "pulse",
          originalIndex: 7,
          beat: 2,
          duration: 4,
          action: { type: "effect", instance_id: "pulse" },
        }}
      />
    </TimelineActionContext.Provider>,
  );
  return actions;
}

describe("DraggableBlock keyboard controls", () => {
  it("can receive focus, nudge at two step sizes, and delete", () => {
    const actions = renderBlock();
    const block = screen.getByRole("button", { name: /pulse, starts at beat 2/ });

    block.focus();
    expect(document.activeElement).toBe(block);
    expect(block.className).toContain("focus-visible:ring-2");

    fireEvent.keyDown(block, { key: "ArrowRight" });
    fireEvent.keyDown(block, { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(block, { key: "Delete" });

    expect(actions.onNudge).toHaveBeenNthCalledWith(1, 7, 0.5);
    expect(actions.onNudge).toHaveBeenNthCalledWith(2, 7, -4);
    expect(actions.onDelete).toHaveBeenCalledWith(7);
  });
});
