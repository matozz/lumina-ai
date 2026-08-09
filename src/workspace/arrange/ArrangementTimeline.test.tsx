import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authoringSessionKey,
  authoringTransportActions,
  useAuthoringTransportStore,
} from "@/authoring/transport";
import { assetKey, createCueAsset, createEffectAsset, exactAsset } from "@/document/projectModel";
import { productionCatalogActions } from "@/stores/productionCatalog";
import { projectActions, useProjectStore } from "@/stores/project";
import { useWorkspaceStore, workspaceActions } from "@/stores/workspace";
import {
  addAutomationKeyframe,
  addAutomationLane,
  automationOptions,
  automationOptionsForClip,
} from "./timeline/arrangementTimelineModel";
import { ArrangementTimeline } from "./ArrangementTimeline";

describe("ArrangementTimeline workflow", () => {
  beforeEach(() => {
    localStorage.clear();
    projectActions.reset();
    authoringTransportActions.reset();
    productionCatalogActions.reset();
    workspaceActions.reset();
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("uses Space to toggle the selected Arrangement transport", () => {
    const reference = useProjectStore.getState().selectedArrangementRef;
    render(<ArrangementTimeline />);
    const timeline = screen.getByRole("region", { name: "Arrangement timeline" });
    const sessionKey = authoringSessionKey("arrangement", assetKey(reference));
    const addAutomation = screen.getByRole("button", {
      name: "Add typed Arrangement automation lane",
    });

    expect(addAutomation.textContent).toBe("");
    expect(addAutomation.className).toContain("text-muted-foreground");
    expect(addAutomation.className).toContain("size-6");

    fireEvent.keyDown(timeline, { key: " ", code: "Space" });

    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.playback).toBe("playing");
    fireEvent.keyDown(timeline, { key: " ", code: "Space", repeat: true });
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.playback).toBe("playing");
    fireEvent.keyDown(timeline, { key: " ", code: "Space" });
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.playback).toBe("paused");
  });

  it("uses Command/Ctrl plus horizontal arrows to jump to the start or last CueClip", () => {
    const effect = projectActions.createEffect("Jump Effect")!;
    const cue = projectActions.createCue([effect], "Jump Cue")!;
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed shortcut destinations", (arrangement) => {
      arrangement.tracks[0].clips = [
        { id: "early", cue_ref: cue, start_tick: 960, duration_tick: 960 },
        { id: "latest", cue_ref: cue, start_tick: 5_760, duration_tick: 960 },
      ];
    });
    const historyBefore = useProjectStore.getState().historyCursor;
    const { container } = render(<ArrangementTimeline />);
    const scroll = container.querySelector<HTMLElement>("[data-arrangement-timeline-scroll]")!;
    Object.defineProperty(scroll, "clientWidth", { configurable: true, value: 400 });
    const sessionKey = authoringSessionKey(
      "arrangement",
      assetKey(useProjectStore.getState().selectedArrangementRef),
    );

    fireEvent.keyDown(window, { key: "ArrowRight", metaKey: true });
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.cursorTick).toBe(5_760);
    expect(scroll.scrollLeft).toBe(88);

    fireEvent.keyDown(window, { key: "ArrowLeft", metaKey: true });
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.cursorTick).toBe(0);
    expect(scroll.scrollLeft).toBe(0);
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore);
  });

  it("materializes a selected built-in Cue only when placing it", () => {
    const scratch = useProjectStore.getState().bundle;
    const initialCueCount = scratch.cues.length;
    const effect = createEffectAsset(scratch, "Pulse");
    effect.id = "builtin.intensity.pulse";
    effect.source = "built_in";
    const cue = createCueAsset(scratch, [effect], "Full-stage Drop Pulse");
    cue.id = "__builtin-cue-four-on-floor--stage-1-r1";
    productionCatalogActions.setCatalog({
      schema_version: 1,
      effects: [effect],
      cue_recipes: [],
      layouts: [],
      arrangements: [],
      project_templates: [],
    });
    workspaceActions.setSelectedArrangeBuiltInCue({
      recipeRef: { id: "recipe.four-on-floor", revision: 1 },
      cue,
    });
    const historyBefore = useProjectStore.getState().historyCursor;

    render(<ArrangementTimeline />);

    expect(useProjectStore.getState().bundle.cues).toHaveLength(initialCueCount);
    fireEvent.click(screen.getByRole("button", { name: "Place Cue" }));

    const state = useProjectStore.getState();
    const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
    const savedCue = exactAsset(state.bundle.cues, { id: cue.id, revision: cue.revision });
    expect(state.bundle.cues).toHaveLength(initialCueCount + 1);
    expect(savedCue).toMatchObject({
      id: cue.id,
      revision: cue.revision,
      layers: [
        expect.objectContaining({
          effect_ref: { id: effect.id, revision: effect.revision },
        }),
      ],
    });
    expect(state.bundle.effects).toContainEqual(effect);
    expect(state.bundle.manifest.effect_refs).toContainEqual({
      id: effect.id,
      revision: effect.revision,
    });
    expect(
      state.bundle.manifest.effect_refs.every((reference) => !("schema_version" in reference)),
    ).toBe(true);
    expect(savedCue?.layers.every((layer) => !("schema_version" in layer.effect_ref))).toBe(true);
    expect(arrangement.tracks[0].clips).toContainEqual(
      expect.objectContaining({ cue_ref: { id: cue.id, revision: cue.revision } }),
    );
    expect(state.selectedCueRef).toBeNull();
    expect(state.historyCursor).toBe(historyBefore + 1);
  });

  it("renders multi-meter ruler marks, zoom snap, selection inspector, and one-step keyboard edits", async () => {
    const effect = projectActions.createEffect("Pulse")!;
    const cue = projectActions.createCue([effect], "Pulse Cue")!;
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed Arrangement timeline", (arrangement) => {
      arrangement.time_signatures = [
        { time_tick: 0, numerator: 3, denominator: 4 },
        { time_tick: 5_760, numerator: 4, denominator: 4 },
      ];
      arrangement.tempo_map.points.push({ time_tick: 5_760, bpm: 96 });
      arrangement.tracks[0].clips = [
        {
          id: "clip-a",
          cue_ref: cue,
          start_tick: 960,
          duration_tick: 1_920,
          playback: "loop",
        },
      ];
    });
    const seededReference = useProjectStore.getState().selectedArrangementRef;
    const historyBefore = useProjectStore.getState().historyCursor;
    const { container } = render(<ArrangementTimeline />);

    const ruler = screen.getByRole("slider", { name: "Seek Arrangement timeline" });
    expect([...ruler.querySelectorAll("span")].map((mark) => mark.textContent)).toEqual(
      expect.arrayContaining(["1", "1.2", "1.3", "2", "2.2", "2.3", "3"]),
    );
    expect(container.querySelector('[title="96 BPM at tick 5760"]')).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Arrangement timeline snap" }).textContent).toBe(
      "½ beat",
    );
    const historyBeforeZoom = useProjectStore.getState().historyCursor;
    fireEvent.click(screen.getByRole("button", { name: "Zoom Arrangement timeline out" }));
    expect(screen.getByRole("combobox", { name: "Arrangement timeline snap" }).textContent).toBe(
      "½ beat",
    );
    expect(useProjectStore.getState().historyCursor).toBe(historyBeforeZoom);

    const clip = screen.getByRole("button", { name: /Pulse Cue, starts at tick 960/ });
    fireEvent.pointerDown(clip, { button: 0, pointerId: 1, clientX: 48 });
    fireEvent.pointerUp(clip, { pointerId: 1, clientX: 48 });
    expect((screen.getByLabelText("Start tick") as HTMLInputElement).value).toBe("960");
    fireEvent.keyDown(clip, { key: "ArrowRight" });

    await waitFor(() => {
      const state = useProjectStore.getState();
      const current = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
      expect(current.tracks[0].clips?.[0].start_tick).toBe(1_440);
    });
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 1);
    expect(assetKey(useProjectStore.getState().selectedArrangementRef)).toBe(
      assetKey(seededReference),
    );
  });

  it("does not capture Space while an inspector input is editing", () => {
    const effect = projectActions.createEffect("Pulse")!;
    const cue = projectActions.createCue([effect], "Pulse Cue")!;
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed editable clip", (arrangement) => {
      arrangement.tracks[0].clips = [
        { id: "clip-a", cue_ref: cue, start_tick: 960, duration_tick: 1_920 },
      ];
    });
    render(<ArrangementTimeline />);
    const clip = screen.getByRole("button", { name: /Pulse Cue, starts at tick 960/ });
    fireEvent.pointerDown(clip, { button: 0, pointerId: 11, clientX: 48 });
    fireEvent.pointerUp(clip, { pointerId: 11, clientX: 48 });
    const input = screen.getByLabelText("Start tick");
    const sessionKey = authoringSessionKey(
      "arrangement",
      assetKey(useProjectStore.getState().selectedArrangementRef),
    );

    fireEvent.keyDown(input, { key: " ", code: "Space" });

    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.playback).toBe("stopped");
  });

  it("toggles Timeline focus mode as a workspace-only preference", () => {
    render(<ArrangementTimeline />);
    const historyBefore = useProjectStore.getState().historyCursor;

    fireEvent.click(screen.getByRole("button", { name: "Enter Timeline focus mode" }));

    expect(useWorkspaceStore.getState().arrangeTimelineFocus).toBe(true);
    expect(screen.getByRole("button", { name: "Exit Timeline focus mode" })).toBeTruthy();
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore);
  });

  it("shows overlap failure beside the selected CueClip with a recovery action", () => {
    const effect = projectActions.createEffect("Pulse")!;
    const cue = projectActions.createCue([effect], "Pulse Cue")!;
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed rejecting track", (arrangement) => {
      arrangement.tracks[0].overlap_policy = "reject";
      arrangement.tracks[0].clips = [
        { id: "clip-a", cue_ref: cue, start_tick: 960, duration_tick: 1_920 },
        { id: "clip-b", cue_ref: cue, start_tick: 3_000, duration_tick: 960 },
      ];
    });
    render(<ArrangementTimeline />);
    const clip = screen.getByRole("button", { name: /Pulse Cue, starts at tick 960/ });
    fireEvent.pointerDown(clip, { button: 0, pointerId: 2, clientX: 48 });
    fireEvent.pointerUp(clip, { pointerId: 2, clientX: 48 });
    fireEvent.keyDown(clip, { key: "ArrowRight" });

    expect(screen.getByText(/ARRANGEMENT_CLIP_OVERLAP_REJECTED/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss and retry" })).toBeTruthy();
  });

  it("renders layered and overlapping CueClips on distinct visual rows", () => {
    const effect = projectActions.createEffect("Layered")!;
    const cue = projectActions.createCue([effect], "Corner Cue")!;
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed layered clips", (arrangement) => {
      arrangement.tracks[0].overlap_policy = "layer";
      arrangement.tracks[0].clips = [
        { id: "top-left", cue_ref: cue, start_tick: 0, duration_tick: 1_920, layer: 0 },
        { id: "top-right", cue_ref: cue, start_tick: 960, duration_tick: 1_920, layer: 1 },
        { id: "bottom-left", cue_ref: cue, start_tick: 1_920, duration_tick: 1_920, layer: 2 },
        { id: "bottom-right", cue_ref: cue, start_tick: 2_880, duration_tick: 1_920, layer: 3 },
        { id: "top-left-return", cue_ref: cue, start_tick: 4_800, duration_tick: 1_920, layer: 0 },
      ];
    });

    const { container } = render(<ArrangementTimeline />);
    expect(screen.getByText("5 CueClips · 4 clip layers · 4 visual rows")).toBeTruthy();
    expect(
      container.querySelector('[data-track-id="cues"]')?.getAttribute("data-cue-row-count"),
    ).toBe("4");
    expect(container.querySelector<HTMLElement>('[data-clip-id="top-left"]')?.style.top).toBe(
      "8px",
    );
    expect(container.querySelector<HTMLElement>('[data-clip-id="top-right"]')?.style.top).toBe(
      "52px",
    );
    expect(container.querySelector<HTMLElement>('[data-clip-id="bottom-left"]')?.style.top).toBe(
      "96px",
    );
    expect(container.querySelector<HTMLElement>('[data-clip-id="bottom-right"]')?.style.top).toBe(
      "140px",
    );
    expect(
      container.querySelector<HTMLElement>('[data-clip-id="top-left-return"]')?.style.top,
    ).toBe("8px");
  });

  it("copies, pastes, duplicates, deletes, and undoes a multi-clip selection atomically", async () => {
    const effect = projectActions.createEffect("Bulk Pulse")!;
    const cue = projectActions.createCue([effect], "Bulk Cue")!;
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed bulk timeline editing", (arrangement) => {
      arrangement.tracks[0].clips = [
        { id: "bulk-a", cue_ref: cue, start_tick: 960, duration_tick: 960, layer: 0 },
        { id: "bulk-b", cue_ref: cue, start_tick: 2_880, duration_tick: 960, layer: 0 },
      ];
    });
    const historyBefore = useProjectStore.getState().historyCursor;
    render(<ArrangementTimeline />);
    const sessionKey = authoringSessionKey(
      "arrangement",
      assetKey(useProjectStore.getState().selectedArrangementRef),
    );
    authoringTransportActions.seek(sessionKey, 5_760);
    const first = screen.getByRole("button", { name: /Bulk Cue, starts at tick 960/ });
    const second = screen.getByRole("button", { name: /Bulk Cue, starts at tick 2880/ });

    fireEvent.pointerDown(first, { button: 0, pointerId: 20, clientX: 48 });
    fireEvent.pointerUp(first, { pointerId: 20, clientX: 48 });
    fireEvent.pointerDown(second, { button: 0, pointerId: 21, clientX: 144, shiftKey: true });
    fireEvent.pointerUp(second, { pointerId: 21, clientX: 144, shiftKey: true });
    fireEvent.keyDown(window, { key: "c", metaKey: true });
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore);

    fireEvent.keyDown(window, { key: "v", metaKey: true });
    await waitFor(() => {
      const current = exactAsset(
        useProjectStore.getState().bundle.arrangements,
        useProjectStore.getState().selectedArrangementRef,
      )!;
      expect(current.tracks[0].clips).toHaveLength(4);
      expect(current.tracks[0].clips?.map((clip) => clip.start_tick)).toEqual([
        960, 2_880, 5_760, 7_680,
      ]);
    });
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 1);

    fireEvent.keyDown(window, { key: "d", metaKey: true });
    await waitFor(() => {
      const current = exactAsset(
        useProjectStore.getState().bundle.arrangements,
        useProjectStore.getState().selectedArrangementRef,
      )!;
      expect(current.tracks[0].clips).toHaveLength(6);
    });
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 2);

    fireEvent.keyDown(window, { key: "Delete" });
    await waitFor(() => {
      const current = exactAsset(
        useProjectStore.getState().bundle.arrangements,
        useProjectStore.getState().selectedArrangementRef,
      )!;
      expect(current.tracks[0].clips).toHaveLength(4);
    });
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 3);

    fireEvent.keyDown(window, { key: "z", metaKey: true });
    await waitFor(() => {
      const current = exactAsset(
        useProjectStore.getState().bundle.arrangements,
        useProjectStore.getState().selectedArrangementRef,
      )!;
      expect(current.tracks[0].clips).toHaveLength(6);
    });
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 2);
  });

  it("selects and clears the current Arrangement scope with Command+A", async () => {
    const effect = projectActions.createEffect("Select Pulse")!;
    const cue = projectActions.createCue([effect], "Select Cue")!;
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed selection scope", (arrangement) => {
      arrangement.tracks[0].clips = [
        { id: "select-a", cue_ref: cue, start_tick: 0, duration_tick: 960 },
        { id: "select-b", cue_ref: cue, start_tick: 1_920, duration_tick: 960 },
      ];
      addAutomationLane(
        arrangement,
        arrangement.tracks[0].id,
        automationOptions(useProjectStore.getState().bundle, arrangement)[0],
        0,
      );
    });
    const { container } = render(<ArrangementTimeline />);

    fireEvent.keyDown(window, { key: "a", metaKey: true });
    await waitFor(() => {
      expect(container.querySelectorAll('[data-clip-id][aria-pressed="true"]')).toHaveLength(2);
      expect(
        container.querySelectorAll('button[aria-label*="keyframe"][aria-pressed="true"]'),
      ).toHaveLength(1);
    });

    fireEvent.keyDown(window, { key: "a", metaKey: true, shiftKey: true });
    await waitFor(() => {
      expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    });
  });

  it("renders typed automation curves and adds a keyframe as one transaction", async () => {
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed typed automation", (arrangement) => {
      const bundle = useProjectStore.getState().bundle;
      const option = automationOptions(bundle, arrangement)[0];
      const laneId = addAutomationLane(arrangement, arrangement.tracks[0].id, option, 0);
      addAutomationKeyframe(
        arrangement,
        arrangement.tracks[0].id,
        laneId,
        3_840,
        option.initialValue,
        "hold",
      );
    });
    const historyBefore = useProjectStore.getState().historyCursor;
    const { container } = render(<ArrangementTimeline />);
    const lane = screen.getByRole("group", { name: /Master dimmer automation lane/ });

    const curve = container.querySelector<SVGElement>("[data-automation-curve]")!;
    const curvePath = curve.querySelector("path")!;
    const firstKeyframe = screen.getAllByRole("button", {
      name: /Master dimmer keyframe at tick/,
    })[0];
    expect(curve.getAttribute("viewBox")?.endsWith(" 32")).toBe(true);
    expect(curvePath.getAttribute("d")).toContain("M 0 6");
    expect(firstKeyframe.className).toContain("size-2.5");
    expect(firstKeyframe.style.top).toBe("6px");
    fireEvent.doubleClick(lane, { clientX: 96 });

    await waitFor(() => {
      const state = useProjectStore.getState();
      const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
      expect(arrangement.tracks[0].automation_lanes?.[0].keyframes).toHaveLength(3);
    });
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 1);
    expect(
      screen.getByRole("button", { name: "Master dimmer keyframe at tick 1920" }),
    ).toBeTruthy();
  });

  it("renders automatable Color as centered swatches and a gradient band", () => {
    const effectRef = projectActions.createEffect("Color drop")!;
    const cueRef = projectActions.createCue([effectRef], "Color drop Cue")!;
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed Color lane", (arrangement, bundle) => {
      arrangement.tracks[0].clips = [
        { id: "color-drop", cue_ref: cueRef, start_tick: 0, duration_tick: 1_920 },
      ];
      arrangement.tracks[0].automation_lanes = [];
      const option = automationOptionsForClip(bundle, arrangement, "color-drop").find(
        (candidate) => candidate.definition.id === "color",
      )!;
      const laneId = addAutomationLane(arrangement, "cues", option, 0);
      const lane = arrangement.tracks[0].automation_lanes?.find(
        (candidate) => candidate.id === laneId,
      )!;
      lane.keyframes[0].value = { type: "color", value: "#FF0000" };
      addAutomationKeyframe(
        arrangement,
        "cues",
        laneId,
        960,
        { type: "color", value: "#0000FF" },
        "linear",
      );
    });

    const { container } = render(<ArrangementTimeline />);

    expect(container.querySelector("[data-automation-color-band]")).toBeTruthy();
    const red = container.querySelector<HTMLElement>('[data-keyframe-color="#FF0000"]')!;
    const blue = container.querySelector<HTMLElement>('[data-keyframe-color="#0000FF"]')!;
    expect(red.style.top).toBe("16px");
    expect(blue.style.top).toBe("16px");
    expect(red.style.backgroundColor).toBe("#FF0000");
    expect(blue.style.backgroundColor).toBe("#0000FF");
  });

  it("creates and reveals legal typed automation from the CueClip context tick", async () => {
    const originalEffectRef = projectActions.createEffect("Context Effect")!;
    projectActions.updateEffect(originalEffectRef, "Expose one context parameter", (effect) => {
      effect.parameters.forEach((parameter, index) => {
        parameter.override_policy = index === 0 ? "cue_override" : "effect_only";
      });
      effect.parameters[1].automation = "disabled";
    });
    const effectRef = useProjectStore.getState().selectedEffectRef!;
    const cueRef = projectActions.createCue([effectRef], "Context Cue")!;
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed context automation clip", (arrangement) => {
      arrangement.tracks[0].clips = [
        { id: "context-clip", cue_ref: cueRef, start_tick: 0, duration_tick: 7_680 },
      ];
      arrangement.tracks[0].automation_lanes = [];
    });
    const historyBefore = useProjectStore.getState().historyCursor;
    const { container } = render(<ArrangementTimeline />);
    const scroll = container.querySelector<HTMLElement>("[data-arrangement-timeline-scroll]")!;
    scroll.getBoundingClientRect = () =>
      ({ left: 0, right: 800, top: 0, bottom: 500, width: 800, height: 500 }) as DOMRect;
    const clip = screen.getByRole("button", { name: /Context Cue, starts at tick 0/ });
    const sessionKey = authoringSessionKey(
      "arrangement",
      assetKey(useProjectStore.getState().selectedArrangementRef),
    );

    fireEvent.contextMenu(clip, { clientX: 72, clientY: 80 });
    expect(await screen.findByText("Add automation")).toBeTruthy();
    const speed = await screen.findByRole("menuitem", { name: /Speed.*scalar/ });
    fireEvent.click(speed);

    await waitFor(() => {
      const state = useProjectStore.getState();
      const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
      expect(arrangement.tracks[0].automation_lanes).toHaveLength(1);
      expect(arrangement.tracks[0].automation_lanes?.[0].keyframes).toEqual([
        expect.objectContaining({ time_tick: 1_440 }),
      ]);
    });
    expect(screen.queryByText("Phase")).toBeNull();
    const deleteLane = screen.getByRole("button", {
      name: "Delete Context Cue · Speed automation lane",
    });
    expect(deleteLane.closest('[aria-label="Arrangement track headers"]')).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Add Speed keyframe at visible range start" }),
    ).toBeNull();
    const firstPoint = screen.getByRole("button", { name: "Speed keyframe at tick 1440" });
    await waitFor(() => expect(document.activeElement).toBe(firstPoint));
    expect(screen.queryByRole("heading", { name: "Speed keyframe" })).toBeNull();
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 1);
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.cursorTick).toBe(0);
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.playback).toBe("stopped");

    scroll.scrollLeft = 0;
    fireEvent.contextMenu(clip, { clientX: 72, clientY: 80 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reveal existing automation" }));
    await waitFor(() => expect(document.activeElement).toBe(firstPoint));
    expect(screen.queryByRole("heading", { name: "Speed keyframe" })).toBeNull();
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 1);

    scroll.scrollLeft = 0;
    fireEvent.contextMenu(clip, { clientX: 96, clientY: 80 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reveal existing automation" }));

    await waitFor(() => {
      const state = useProjectStore.getState();
      const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
      expect(arrangement.tracks[0].automation_lanes).toHaveLength(1);
      expect(arrangement.tracks[0].automation_lanes?.[0].keyframes).toHaveLength(2);
      expect(arrangement.tracks[0].automation_lanes?.[0].keyframes[1].time_tick).toBe(1_920);
    });
    const secondPoint = screen.getByRole("button", { name: "Speed keyframe at tick 1920" });
    await waitFor(() => expect(document.activeElement).toBe(secondPoint));
    expect(screen.queryByRole("heading", { name: "Speed keyframe" })).toBeNull();
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 2);
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.cursorTick).toBe(0);
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.playback).toBe("stopped");

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Context Cue · Speed automation lane" }),
    );
    await waitFor(() => {
      const state = useProjectStore.getState();
      const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
      expect(arrangement.tracks[0].automation_lanes).toHaveLength(0);
    });
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 3);
  });

  it("adds, edits, and changes interpolation from automation context menus", async () => {
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed automation context row", (arrangement) => {
      const bundle = useProjectStore.getState().bundle;
      addAutomationLane(
        arrangement,
        arrangement.tracks[0].id,
        automationOptions(bundle, arrangement)[0],
        0,
      );
    });
    const historyBefore = useProjectStore.getState().historyCursor;
    const { container } = render(<ArrangementTimeline />);
    const scroll = container.querySelector<HTMLElement>("[data-arrangement-timeline-scroll]")!;
    scroll.getBoundingClientRect = () =>
      ({ left: 0, right: 800, top: 0, bottom: 500, width: 800, height: 500 }) as DOMRect;
    const lane = screen.getByRole("group", { name: /Master dimmer automation lane/ });

    fireEvent.contextMenu(lane, { clientX: 96, clientY: 120 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Add keyframe here" }));

    await waitFor(() => {
      const state = useProjectStore.getState();
      const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
      expect(arrangement.tracks[0].automation_lanes?.[0].keyframes).toHaveLength(2);
      expect(arrangement.tracks[0].automation_lanes?.[0].keyframes[1].time_tick).toBe(1_920);
    });
    const keyframe = screen.getByRole("button", {
      name: "Master dimmer keyframe at tick 1920",
    });
    fireEvent.contextMenu(keyframe, { clientX: 96, clientY: 120 });
    const interpolation = await screen.findByRole("menuitem", { name: "Interpolation" });
    fireEvent.keyDown(interpolation, { key: "ArrowRight" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Hold" }));

    await waitFor(() => {
      const state = useProjectStore.getState();
      const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
      expect(arrangement.tracks[0].automation_lanes?.[0].keyframes[1].interpolation).toBe("hold");
    });
    fireEvent.contextMenu(keyframe, { clientX: 96, clientY: 120 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit value" }));
    expect(await screen.findByText("Master dimmer keyframe")).toBeTruthy();
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 2);
  });

  it("places from a blank-row context tick and copies from the CueClip menu", async () => {
    const effectRef = projectActions.createEffect("Row Context Effect")!;
    const cueRef = projectActions.createCue([effectRef], "Row Context Cue")!;
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Clear context row", (arrangement) => {
      arrangement.tracks[0].clips = [];
      arrangement.tracks[0].automation_lanes = [];
    });
    const historyBefore = useProjectStore.getState().historyCursor;
    const { container } = render(<ArrangementTimeline />);
    const scroll = container.querySelector<HTMLElement>("[data-arrangement-timeline-scroll]")!;
    scroll.getBoundingClientRect = () =>
      ({ left: 0, right: 800, top: 0, bottom: 500, width: 800, height: 500 }) as DOMRect;
    const row = container.querySelector<HTMLElement>('[data-track-id="cues"]')!;

    fireEvent.contextMenu(row, { clientX: 96, clientY: 80 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Place selected Cue here" }));

    await waitFor(() => {
      const state = useProjectStore.getState();
      const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
      expect(arrangement.tracks[0].clips).toEqual([
        expect.objectContaining({ cue_ref: cueRef, start_tick: 1_920 }),
      ]);
    });
    const clip = screen.getByRole("button", { name: /Row Context Cue, starts at tick 1920/ });
    fireEvent.contextMenu(clip, { clientX: 96, clientY: 80 });
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Copy/ }));
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: /^Copy/ })).toBeNull();
      expect(document.querySelector("[data-base-ui-inert]")).toBeNull();
    });

    fireEvent.keyDown(window, { key: "v", metaKey: true });

    await waitFor(() => {
      const state = useProjectStore.getState();
      const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
      expect(arrangement.tracks[0].clips).toHaveLength(2);
      expect(arrangement.tracks[0].clips?.[1]).toMatchObject({ start_tick: 0 });
    });
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 2);
    const sessionKey = authoringSessionKey(
      "arrangement",
      assetKey(useProjectStore.getState().selectedArrangementRef),
    );
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.cursorTick).toBe(0);
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.playback).toBe("stopped");
  });
});
