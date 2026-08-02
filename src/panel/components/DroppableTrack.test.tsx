import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineActionContext, type TimelineActions } from "../context/TimelineContext";
import type { TimelineTrackData, UITimelineEvent } from "../types";
import { viewportFromScroll } from "../virtualization";
import { createTimelineGeometry } from "../timelineGeometry";
import { DroppableTrack } from "./DroppableTrack";

const actions: TimelineActions = {
  geometry: createTimelineGeometry(960, 40),
  onDragStart: vi.fn(),
  onResizeStart: vi.fn(),
  onDelete: vi.fn(),
  onNudge: vi.fn(),
  onTrimClipOverlaps: vi.fn(),
  onReplaceClipOverlaps: vi.fn(),
  onAddKeyframe: vi.fn(),
  onMoveKeyframes: vi.fn(),
  onDeleteKeyframes: vi.fn(),
  onUpdateKeyframe: vi.fn(),
  onGridClick: vi.fn(),
  onDropEffect: vi.fn(),
  onSnapPreview: vi.fn(),
  onSnapPreviewEnd: vi.fn(),
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
          beatWidth={40}
        />
      </TimelineActionContext.Provider>,
    );

    expect(container.querySelectorAll('[role="button"]')).toHaveLength(24);
  });

  it("accepts an effect-library native drop without changing pointer interactions", () => {
    const track: TimelineTrackData = { id: "effects", name: "Lighting looks", events: [] };
    const { container } = render(
      <TimelineActionContext.Provider value={actions}>
        <DroppableTrack
          track={track}
          selectedPhaser={null}
          viewport={viewportFromScroll(0, 1_200, 40)}
          beatWidth={40}
        />
      </TimelineActionContext.Provider>,
    );
    const target = container.querySelector('[data-track-name="effects"]');
    expect(target).not.toBeNull();
    const dataTransfer = {
      types: ["application/x-lumina-effect-instance"],
      dropEffect: "none",
      getData: vi.fn(() => "red-pulse-instance"),
    };

    fireEvent.dragOver(target!, { dataTransfer });
    fireEvent.drop(target!, { dataTransfer, clientX: 240 });

    expect(actions.onDropEffect).toHaveBeenCalledOnce();
  });
});
