import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineActionContext, type TimelineActions } from "../context/TimelineContext";
import type { TimelineTrackData, UITimelineEvent } from "../types";
import { viewportFromScroll } from "../virtualization";
import { DroppableTrack } from "./DroppableTrack";

const actions: TimelineActions = {
  onDragStart: vi.fn(),
  onResizeStart: vi.fn(),
  onDelete: vi.fn(),
  onNudge: vi.fn(),
  onAddKeyframe: vi.fn(),
  onMoveKeyframes: vi.fn(),
  onDeleteKeyframes: vi.fn(),
  onUpdateKeyframe: vi.fn(),
  onGridClick: vi.fn(),
};

describe("DroppableTrack virtualization", () => {
  it("mounts a bounded number of blocks for a one-thousand-clip show", () => {
    const events: UITimelineEvent[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: `clip-${index}`,
      originalIndex: index,
      beat: index * 2,
      duration: 1,
      action: { type: "effect", instance_id: "pulse" },
    }));
    const track: TimelineTrackData = { id: "phaser:pulse", name: "pulse", events };
    const viewport = viewportFromScroll(20_000, 1_200, 40);
    const { container } = render(
      <TimelineActionContext.Provider value={actions}>
        <DroppableTrack
          track={track}
          selectedPhaser={null}
          viewport={viewport}
          isExpanded={false}
        />
      </TimelineActionContext.Provider>,
    );

    expect(container.querySelectorAll('[role="button"]')).toHaveLength(24);
  });
});
