import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FullDSL } from "@/bridge/types";
import { useEngineStore } from "@/stores/engine";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimelineActionContext, type TimelineActions } from "../context/TimelineContext";
import type { UITimelineEvent } from "../types";
import { EffectClipOverlapInspector } from "./EffectClipOverlapInspector";

const documentFixture: FullDSL = {
  schema_version: 4,
  meta: { name: "Overlap inspector" },
  patch: [],
  layout: { type: "generator", generator: { shape: "custom", fixtures: [] } },
  groups: [],
  effect_definitions: [],
  effect_instances: [],
  timeline: {
    ppq: 960,
    tempo_map: { points: [{ time_tick: 0, bpm: 120 }] },
    tracks: [
      {
        id: "effects",
        name: "Effects",
        overlap_policy: "layer",
        clips: [
          {
            id: "selected",
            instance_id: "pulse",
            start_tick: 0,
            duration_tick: 960,
            source_offset_tick: 0,
            playback: "once",
            layer: 0,
          },
          {
            id: "overlap",
            instance_id: "pulse",
            start_tick: 480,
            duration_tick: 960,
            source_offset_tick: 0,
            playback: "once",
            layer: 1,
          },
        ],
        automation_lanes: [],
      },
    ],
  },
};

const event: UITimelineEvent = {
  id: "selected",
  originalIndex: 3,
  beat: 0,
  duration: 1,
  action: { type: "effect", instance_id: "pulse" },
  source_track_id: "effects",
  source_item_id: "selected",
};

function actions(): TimelineActions {
  return {
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
  };
}

describe("EffectClipOverlapInspector", () => {
  beforeEach(() => {
    useEngineStore.setState(
      { ...useEngineStore.getInitialState(), parsedDsl: documentFixture },
      true,
    );
  });

  it("shows exact trim/replace impact before invoking either command", () => {
    const timelineActions = actions();
    const onApplied = vi.fn();
    render(
      <TimelineActionContext.Provider value={timelineActions}>
        <Popover open>
          <PopoverTrigger render={<button>Clip</button>} />
          <PopoverContent>
            <EffectClipOverlapInspector event={event} onApplied={onApplied} />
          </PopoverContent>
        </Popover>
      </TimelineActionContext.Provider>,
    );

    expect(screen.getByText(/Track policy: layer/)).toBeTruthy();
    expect(screen.getByText("Keep ticks 0–480; source offset 0.")).toBeTruthy();
    expect(screen.getByText(/Delete 1 overlapping clip: overlap/)).toBeTruthy();
    expect(timelineActions.onTrimClipOverlaps).not.toHaveBeenCalled();
    expect(timelineActions.onReplaceClipOverlaps).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Apply trim/ }));
    fireEvent.click(screen.getByRole("button", { name: /Replace overlaps/ }));
    expect(timelineActions.onTrimClipOverlaps).toHaveBeenCalledWith(3);
    expect(timelineActions.onReplaceClipOverlaps).toHaveBeenCalledWith(3);
    expect(onApplied).toHaveBeenCalledTimes(2);
  });
});
