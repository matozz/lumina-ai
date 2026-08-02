import { act, fireEvent, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { FullDSL } from "@/bridge/types";
import { engineActions, useEngineStore } from "@/stores/engine";
import { useTimelineEvents } from "./useTimelineEvents";

const documentFixture: FullDSL = {
  schema_version: 4,
  meta: { name: "Timeline interaction" },
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
            id: "pulse",
            instance_id: "pulse",
            start_tick: 0,
            duration_tick: 960,
            source_offset_tick: 0,
            playback: "once",
            layer: 0,
          },
        ],
        automation_lanes: [],
      },
    ],
  },
};

describe("timeline pointer interactions", () => {
  beforeEach(() => {
    useEngineStore.setState(useEngineStore.getInitialState(), true);
    engineActions.loadCurrentDslCode(JSON.stringify(documentFixture));
  });

  it("previews pointer movement in the DOM and commits one transaction on pointerup", () => {
    const block = document.createElement("div");
    document.body.append(block);
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useTimelineEvents();
    });
    const initialRenderCount = renderCount;

    act(() => result.current.startMoving(0, 0, 0, 0, "phaser:pulse", block));
    act(() => fireEvent.pointerMove(window, { clientX: 80, clientY: 12 }));

    expect(block.style.transform).toBe("translate3d(80px, 12px, 0)");
    expect(renderCount).toBe(initialRenderCount);
    expect(useEngineStore.getState().documentHistory).toHaveLength(0);

    act(() => fireEvent.pointerUp(window));

    expect(block.style.transform).toBe("");
    expect(useEngineStore.getState().documentHistory).toHaveLength(1);
    expect(useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.[0].start_tick).toBe(
      1_920,
    );
    block.remove();
  });

  it("discards a resize preview on pointer cancellation", () => {
    const block = document.createElement("div");
    document.body.append(block);
    const { result } = renderHook(() => useTimelineEvents());

    act(() => result.current.startResizing(0, 0, 1, block));
    act(() => fireEvent.pointerMove(window, { clientX: 40, clientY: 0 }));
    expect(block.style.width).toBe("80px");

    act(() => fireEvent.pointerCancel(window));
    expect(block.style.width).toBe("");
    expect(useEngineStore.getState().documentHistory).toHaveLength(0);
    block.remove();
  });
});
