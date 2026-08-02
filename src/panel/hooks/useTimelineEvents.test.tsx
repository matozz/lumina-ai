import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FullDSL } from "@/bridge/types";
import { engineActions, useEngineStore } from "@/stores/engine";
import type { AutomationParameterOption } from "../automationParameters";
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
  let frameCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    frameCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    useEngineStore.setState(useEngineStore.getInitialState(), true);
    engineActions.loadCurrentDslCode(JSON.stringify(documentFixture));
  });

  afterEach(() => vi.unstubAllGlobals());

  const renderTimelineEvents = () =>
    renderHook(() => useTimelineEvents({ beatWidth: 40, scrollRef: { current: null } }));

  const flushAnimationFrame = () => {
    const callbacks = frameCallbacks.splice(0);
    callbacks.forEach((callback) => callback(0));
  };

  it("previews pointer movement in the DOM and commits one transaction on pointerup", () => {
    const block = document.createElement("div");
    document.body.append(block);
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useTimelineEvents({ beatWidth: 40, scrollRef: { current: null } });
    });
    const guide = document.createElement("div");
    guide.append(document.createElement("span"));
    guide.firstElementChild?.setAttribute("data-snap-label", "");
    result.current.snapGuideRef.current = guide;
    const initialRenderCount = renderCount;

    act(() => result.current.startMoving(0, 0, 0, "phaser:pulse", block));
    act(() => {
      fireEvent.pointerMove(window, { clientX: 40, clientY: 4 });
      fireEvent.pointerMove(window, { clientX: 80, clientY: 12 });
    });

    expect(frameCallbacks).toHaveLength(1);
    act(flushAnimationFrame);

    expect(block.style.transform).toBe("translate3d(80px, 12px, 0)");
    expect(guide.dataset.snapTick).toBe("1920");
    expect(renderCount).toBe(initialRenderCount);
    expect(useEngineStore.getState().documentHistory).toHaveLength(0);

    act(() => fireEvent.pointerUp(window));

    expect(block.style.transform).toBe("");
    expect(guide.style.display).toBe("none");
    expect(useEngineStore.getState().documentHistory).toHaveLength(1);
    expect(useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.[0].start_tick).toBe(
      1_920,
    );
    act(() => engineActions.undoDocument());
    expect(useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.[0].start_tick).toBe(0);
    act(() => engineActions.redoDocument());
    expect(useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.[0].start_tick).toBe(
      1_920,
    );
    block.remove();
  });

  it("discards a resize preview on pointer cancellation", () => {
    const block = document.createElement("div");
    document.body.append(block);
    block.style.width = "40px";
    const { result } = renderTimelineEvents();

    act(() => result.current.startResizing(0, 0, block));
    act(() => fireEvent.pointerMove(window, { clientX: 40, clientY: 0 }));
    act(flushAnimationFrame);
    expect(block.style.width).toBe("80px");

    act(() => fireEvent.pointerCancel(window));
    expect(block.style.width).toBe("40px");
    expect(useEngineStore.getState().documentHistory).toHaveLength(0);
    block.remove();
  });

  it("keeps the exact EffectClip duration and width for a same-track move", () => {
    const source = structuredClone(documentFixture);
    source.timeline!.tracks[0].clips![0].duration_tick = 2_880;
    engineActions.loadCurrentDslCode(JSON.stringify(source));
    const block = document.createElement("div");
    block.style.width = "120px";
    document.body.append(block);
    const { result } = renderTimelineEvents();

    act(() => result.current.startMoving(0, 0, 0, "phaser:pulse", block));
    act(() => fireEvent.pointerMove(window, { clientX: 40, clientY: 40 }));
    act(flushAnimationFrame);
    expect(block.style.width).toBe("120px");

    act(() => fireEvent.pointerUp(window));
    const moved = useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.[0];
    expect(moved).toMatchObject({
      id: "pulse",
      instance_id: "pulse",
      start_tick: 960,
      duration_tick: 2_880,
      source_offset_tick: 0,
      layer: 0,
    });
    expect(block.style.width).toBe("120px");
    expect(useEngineStore.getState().documentHistory).toHaveLength(1);
    block.remove();
  });

  it("keeps EffectClip identity and duration when a virtual cross-track move changes its instance", () => {
    const source = structuredClone(documentFixture);
    source.timeline!.tracks[0].clips![0].duration_tick = 2_880;
    engineActions.loadCurrentDslCode(JSON.stringify(source));
    const block = document.createElement("div");
    block.style.width = "120px";
    document.body.append(block);
    const { result } = renderTimelineEvents();

    act(() => result.current.startMoving(0, 0, 0, "phaser:other", block));
    act(() => fireEvent.pointerMove(window, { clientX: 0, clientY: 40 }));
    act(flushAnimationFrame);
    act(() => fireEvent.pointerUp(window));

    expect(useEngineStore.getState().parsedDsl?.timeline?.tracks[0]).toMatchObject({
      id: "effects",
      clips: [
        {
          id: "pulse",
          instance_id: "other",
          start_tick: 0,
          duration_tick: 2_880,
          source_offset_tick: 0,
          layer: 0,
        },
      ],
    });
    expect(block.style.width).toBe("120px");
    expect(useEngineStore.getState().documentHistory).toHaveLength(1);
    block.remove();
  });

  it("commits resize once and restores the original clip on Escape", () => {
    const block = document.createElement("div");
    block.style.width = "40px";
    document.body.append(block);
    const { result } = renderTimelineEvents();

    act(() => result.current.startMoving(0, 0, 0, "phaser:pulse", block));
    act(() => fireEvent.pointerMove(window, { clientX: 40, clientY: 0 }));
    act(flushAnimationFrame);
    act(() => fireEvent.keyDown(window, { key: "Escape" }));
    expect(block.style.transform).toBe("");
    expect(block.style.width).toBe("40px");
    expect(useEngineStore.getState().documentHistory).toHaveLength(0);
    expect(useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.[0]).toMatchObject({
      start_tick: 0,
      duration_tick: 960,
      instance_id: "pulse",
    });

    act(() => result.current.startResizing(0, 0, block));
    act(() => fireEvent.pointerMove(window, { clientX: 40, clientY: 0 }));
    act(flushAnimationFrame);
    act(() => fireEvent.pointerUp(window));
    expect(useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.[0].duration_tick).toBe(
      1_920,
    );
    expect(useEngineStore.getState().documentHistory).toHaveLength(1);
    block.remove();
  });

  it("creates a typed automation lane at the current integer tick", () => {
    const option: AutomationParameterOption = {
      definition: {
        id: "master_dimmer",
        name: "Master dimmer",
        value_type: "scalar",
        default_value: { type: "scalar", value: 1 },
        range: [0, 1],
        unit: "percent",
        ui_hint: "slider",
        automation: "continuous",
      },
      initialValue: { type: "scalar", value: 0.75 },
      target: { scope: "global", parameter_id: "master_dimmer" },
    };
    const { result } = renderTimelineEvents();
    act(() => engineActions.setGlobalBeat(2));

    act(() => result.current.addAutomationLane(option));

    const lane = useEngineStore
      .getState()
      .parsedDsl?.timeline?.tracks.find((track) => track.id === "automation")
      ?.automation_lanes?.[0];
    expect(lane).toMatchObject({
      target: { scope: "global", parameter_id: "master_dimmer" },
      keyframes: [
        { time_tick: 1_920, value: { type: "scalar", value: 0.75 }, interpolation: "linear" },
        { time_tick: 5_760, value: { type: "scalar", value: 0.75 }, interpolation: "hold" },
      ],
    });
    expect(useEngineStore.getState().documentHistory).toHaveLength(1);
  });

  it("applies previewed trim and replacement as one undoable transaction", () => {
    const overlapDocument = structuredClone(documentFixture);
    overlapDocument.timeline!.tracks[0].clips!.push({
      id: "overlap",
      instance_id: "pulse",
      start_tick: 480,
      duration_tick: 960,
      source_offset_tick: 0,
      playback: "once",
      layer: 1,
    });
    engineActions.loadCurrentDslCode(JSON.stringify(overlapDocument));
    const { result } = renderTimelineEvents();

    act(() => result.current.trimClipOverlaps(0));
    expect(useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.[0]).toMatchObject({
      id: "pulse",
      start_tick: 0,
      duration_tick: 480,
      source_offset_tick: 0,
    });
    expect(useEngineStore.getState().documentHistory).toHaveLength(1);

    act(() => engineActions.undoDocument());
    act(() => result.current.replaceClipOverlaps(0));
    expect(
      useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.map((clip) => clip.id),
    ).toEqual(["pulse"]);
    expect(useEngineStore.getState().documentHistory).toHaveLength(1);

    act(() => engineActions.undoDocument());
    expect(
      useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.map((clip) => clip.id),
    ).toEqual(["pulse", "overlap"]);
  });
});
