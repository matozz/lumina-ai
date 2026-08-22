import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FullDSL } from "@/bridge/types";
import { useEngineStore } from "@/stores/engine";
import { TimelineActionContext, type TimelineActions } from "../context/TimelineContext";
import { createTimelineGeometry } from "../timelineGeometry";
import type { UITimelineEvent } from "../types";
import { AutomationLaneBlock } from "./AutomationLaneBlock";

function documentFixture(): FullDSL {
  return {
    schema_version: 1,
    meta: { name: "Automation row" },
    patch: [],
    layout: { type: "generator", generator: { shape: "custom", fixtures: [] } },
    groups: [],
    effect_definitions: [
      {
        id: "pulse",
        name: "Pulse",
        revision: 1,
        source: "project_local",
        tempo: {
          primary_event: "rise_fall_cycle",
          events_per_graph_cycle: 1,
        },
        catalog: {
          energy: 0.5,
          density: 0.5,
          colorfulness: 0.5,
          motion: "pulse",
          strobe_risk: "none",
        },
        parameters: [
          {
            id: "speed",
            name: "Speed",
            schema: {
              type: "scalar",
              default: 1,
              range: { min: 0, max: 2, step: 0.25 },
              unit: "multiplier",
            },
            scope: "arrangement",
            section: "main",
            help: "Playback speed.",
          },
        ],
        graph: { nodes: [] },
      },
    ],
    effect_instances: [
      {
        id: "front",
        definition_id: "pulse",
        definition_revision: 1,
        target_group_id: "front",
        seed: "0000000000000001",
      },
    ],
    timeline: {
      ppq: 960,
      tempo_map: { points: [{ time_tick: 0, bpm: 120 }] },
      tracks: [
        {
          id: "automation",
          name: "Automation",
          overlap_policy: "layer",
          clips: [],
          automation_lanes: [
            {
              id: "speed-lane",
              target: {
                scope: "effect_instance",
                instance_id: "front",
                parameter_id: "speed",
              },
              keyframes: [
                {
                  id: "speed-0",
                  time_tick: 0,
                  value: { type: "scalar", value: 0 },
                  interpolation: "linear",
                },
                {
                  id: "speed-1",
                  time_tick: 1_920,
                  value: { type: "scalar", value: 0.5 },
                  interpolation: "ease_in_out",
                },
                {
                  id: "speed-2",
                  time_tick: 3_840,
                  value: { type: "scalar", value: 1 },
                  interpolation: "hold",
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

function actions(): TimelineActions {
  return {
    geometry: createTimelineGeometry(960, 40),
    onDragStart: vi.fn(),
    onResizeStart: vi.fn(),
    onDelete: vi.fn(),
    onNudge: vi.fn(),
    onResizeBy: vi.fn(),
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
}

const event: UITimelineEvent = {
  id: "speed-lane",
  originalIndex: 0,
  beat: 0,
  duration: 4,
  action: {
    type: "animate",
    target: { scope: "effect_instance", instance_id: "front", parameter_id: "speed" },
    from: 0,
    to: 1,
    easing: "linear",
  },
  source_track_id: "automation",
  source_item_id: "speed-lane",
};

describe("AutomationLaneBlock", () => {
  let frameCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    frameCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    useEngineStore.setState(
      { ...useEngineStore.getInitialState(), parsedDsl: documentFixture() },
      true,
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  const flushAnimationFrame = () => {
    const callbacks = frameCallbacks.splice(0);
    callbacks.forEach((callback) => callback(0));
  };

  it("previews drag in the DOM, commits once, box-selects, and supports keyboard edits", () => {
    const timelineActions = actions();
    render(
      <TimelineActionContext.Provider value={timelineActions}>
        <AutomationLaneBlock event={event} viewport={{ startBeat: 0, endBeat: 8 }} />
      </TimelineActionContext.Provider>,
    );
    const middle = screen.getByRole("button", { name: "Speed keyframe at tick 1920" });

    fireEvent.pointerDown(middle, { button: 0, clientX: 80 });
    expect(document.activeElement).toBe(middle);
    fireEvent.pointerMove(window, { clientX: 121 });
    flushAnimationFrame();
    expect(middle.style.transform).toContain("40px");
    expect(timelineActions.onSnapPreview).toHaveBeenCalledWith(2_880);
    expect(timelineActions.onMoveKeyframes).not.toHaveBeenCalled();
    fireEvent.pointerUp(window);
    expect(timelineActions.onMoveKeyframes).toHaveBeenCalledWith(
      "automation",
      "speed-lane",
      ["speed-1"],
      960,
    );

    const row = screen.getByRole("group", { name: /Speed automation lane/ });
    fireEvent.pointerDown(row, { button: 0, clientX: 0 });
    expect(document.activeElement).toBe(row);
    fireEvent.pointerMove(window, { clientX: 121 });
    flushAnimationFrame();
    fireEvent.pointerUp(window);
    expect(
      screen.getByRole("button", { name: "Speed keyframe at tick 0" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(middle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.keyDown(row, { key: "ArrowRight" });
    expect(timelineActions.onMoveKeyframes).toHaveBeenLastCalledWith(
      "automation",
      "speed-lane",
      ["speed-0", "speed-1"],
      240,
    );
    fireEvent.keyDown(row, { key: "Delete" });
    expect(timelineActions.onDeleteKeyframes).toHaveBeenCalledWith("automation", "speed-lane", [
      "speed-0",
      "speed-1",
    ]);

    useEngineStore.setState({ globalBeat: 4 });
    fireEvent.click(screen.getByRole("button", { name: "Add Speed keyframe at playhead" }));
    expect(timelineActions.onAddKeyframe).toHaveBeenCalledWith(
      "automation",
      "speed-lane",
      4_080,
      { type: "scalar", value: 1 },
      "linear",
    );
  });

  it("restores a keyframe preview on Escape without committing", () => {
    const timelineActions = actions();
    render(
      <TimelineActionContext.Provider value={timelineActions}>
        <AutomationLaneBlock event={event} viewport={{ startBeat: 0, endBeat: 8 }} />
      </TimelineActionContext.Provider>,
    );
    const middle = screen.getByRole("button", { name: "Speed keyframe at tick 1920" });

    fireEvent.pointerDown(middle, { button: 0, clientX: 80 });
    fireEvent.pointerMove(window, { clientX: 121 });
    flushAnimationFrame();
    expect(middle.style.transform).toContain("40px");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(middle.style.transform).toContain("0px");
    expect(timelineActions.onMoveKeyframes).not.toHaveBeenCalled();
    expect(timelineActions.onSnapPreviewEnd).toHaveBeenCalledOnce();
  });

  it("does not route editing-popover keys to automation deletion or movement", () => {
    const timelineActions = actions();
    render(
      <TimelineActionContext.Provider value={timelineActions}>
        <AutomationLaneBlock event={event} viewport={{ startBeat: 0, endBeat: 8 }} />
      </TimelineActionContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Speed keyframe at tick 1920" }));
    const timeInput = screen.getByLabelText("Time tick");
    fireEvent.keyDown(timeInput, { key: "Delete" });
    fireEvent.keyDown(timeInput, { key: "Backspace" });
    fireEvent.keyDown(timeInput, { key: "ArrowRight" });

    expect(timelineActions.onDeleteKeyframes).not.toHaveBeenCalled();
    expect(timelineActions.onMoveKeyframes).not.toHaveBeenCalled();
  });
});
