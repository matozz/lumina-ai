import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assetKey, exactAsset } from "@/document/projectModel";
import { projectActions, useProjectStore } from "@/stores/project";
import { addAutomationLane, automationOptions } from "./timeline/arrangementTimelineModel";
import { ArrangementTimeline } from "./ArrangementTimeline";

describe("ArrangementTimeline workflow", () => {
  beforeEach(() => {
    localStorage.clear();
    projectActions.reset();
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
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
    const historyBefore = useProjectStore.getState().historyCursor;
    const { container } = render(<ArrangementTimeline />);

    const ruler = screen.getByRole("slider", { name: "Seek Arrangement timeline" });
    expect([...ruler.querySelectorAll("span")].map((mark) => mark.textContent)).toEqual(
      expect.arrayContaining(["1", "1.2", "1.3", "2", "2.2", "2.3", "3"]),
    );
    expect(container.querySelector('[title="96 BPM at tick 5760"]')).toBeTruthy();
    expect(screen.getByText("SNAP ½ beat")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zoom Arrangement timeline out" }));
    expect(screen.getByText("SNAP 1 beat")).toBeTruthy();

    const clip = screen.getByRole("button", { name: /Pulse Cue, starts at tick 960/ });
    fireEvent.pointerDown(clip, { button: 0, pointerId: 1, clientX: 48 });
    fireEvent.pointerUp(clip, { pointerId: 1, clientX: 48 });
    expect((screen.getByLabelText("Start tick") as HTMLInputElement).value).toBe("960");
    fireEvent.keyDown(clip, { key: "ArrowRight" });

    await waitFor(() => {
      const state = useProjectStore.getState();
      const current = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
      expect(current.tracks[0].clips?.[0].start_tick).toBe(1_920);
    });
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 1);
    expect(assetKey(useProjectStore.getState().selectedArrangementRef)).toBe(assetKey(reference));
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

    expect(container.querySelector("svg path")).toBeTruthy();
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
