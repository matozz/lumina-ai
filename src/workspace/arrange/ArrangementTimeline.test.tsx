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
import { addAutomationLane, automationOptions } from "./timeline/arrangementTimelineModel";
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

    fireEvent.keyDown(timeline, { key: " ", code: "Space" });

    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.playback).toBe("playing");
    fireEvent.keyDown(timeline, { key: " ", code: "Space", repeat: true });
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.playback).toBe("playing");
    fireEvent.keyDown(timeline, { key: " ", code: "Space" });
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]?.playback).toBe("paused");
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
    expect(
      screen.getByRole("combobox", { name: "Arrangement timeline snap" }).textContent,
    ).toContain("Snap ½ beat");
    const historyBeforeZoom = useProjectStore.getState().historyCursor;
    fireEvent.click(screen.getByRole("button", { name: "Zoom Arrangement timeline out" }));
    expect(
      screen.getByRole("combobox", { name: "Arrangement timeline snap" }).textContent,
    ).toContain("Snap ½ beat");
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
    expect(screen.getByRole("button", { name: "Reset selection" })).toBeTruthy();
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

  it("renders typed automation curves and adds a keyframe as one transaction", async () => {
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed typed automation", (arrangement) => {
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
    const lane = screen.getByRole("group", { name: /Master dimmer automation lane/ });

    const curve = container.querySelector<SVGElement>("[data-automation-curve]")!;
    const curvePath = curve.querySelector("path")!;
    const firstKeyframe = screen.getAllByRole("button", {
      name: /Master dimmer keyframe at tick/,
    })[0];
    expect(curve.getAttribute("viewBox")?.endsWith(" 40")).toBe(true);
    expect(curvePath.getAttribute("d")).toContain("M 0 8");
    expect(firstKeyframe.style.top).toBe("8px");
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
});
