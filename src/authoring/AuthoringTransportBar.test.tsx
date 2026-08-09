import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { assetKey, exactAsset } from "@/document/projectModel";
import { projectActions, useProjectStore } from "@/stores/project";
import { workspaceActions } from "@/stores/workspace";
import { AuthoringTransportBar } from "./AuthoringTransportBar";
import {
  authoringSessionKey,
  authoringTransportActions,
  useAuthoringTransportStore,
} from "./transport";

describe("AuthoringTransportBar", () => {
  beforeEach(() => {
    localStorage.clear();
    projectActions.reset();
    workspaceActions.reset();
    workspaceActions.setAdvancedMode(true);
  });

  it("offers shared Play/Pause/Stop/Seek/Loop controls without editing the Effect asset", () => {
    const reference = projectActions.createEffect("Pulse")!;
    const state = useProjectStore.getState();
    const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
    const bundleBefore = structuredClone(state.bundle);
    const sessionKey = authoringSessionKey("effect", assetKey(reference));

    render(
      <AuthoringTransportBar scope="effect" reference={reference} arrangement={arrangement} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play authoring preview" }));
    expect(useAuthoringTransportStore.getState().sessions[sessionKey].playback).toBe("playing");
    fireEvent.click(screen.getByRole("button", { name: "Pause authoring preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop authoring preview" }));
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]).toMatchObject({
      playback: "stopped",
      cursorTick: 0,
      loopEnabled: true,
    });
    expect(useProjectStore.getState().bundle).toEqual(bundleBefore);
  });

  it("shows musical position instead of clock internals by default", () => {
    workspaceActions.setAdvancedMode(false);
    const reference = projectActions.createEffect("Pulse")!;
    const state = useProjectStore.getState();
    const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;

    render(
      <AuthoringTransportBar scope="effect" reference={reference} arrangement={arrangement} />,
    );

    expect(screen.getByText("Bar 1 · Beat 1")).toBeTruthy();
    expect(screen.getByLabelText("Musical position").textContent).toBe("1.1.000");
    expect(screen.queryByLabelText("Local BPM")).toBeNull();
    expect(screen.queryByText("Follow Arrangement")).toBeNull();
  });

  it("keeps Local BPM, 3/4 meter and loop bars session-only and can Follow Arrangement", () => {
    const reference = projectActions.createEffect("Pulse")!;
    const state = useProjectStore.getState();
    const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
    const sessionKey = authoringSessionKey("effect", assetKey(reference));
    const { rerender } = render(
      <AuthoringTransportBar scope="effect" reference={reference} arrangement={arrangement} />,
    );

    commitNumber("Local BPM", "128");
    commitNumber("Local meter numerator", "3");
    commitNumber("Local loop bars", "2");
    expect(useAuthoringTransportStore.getState().sessions[sessionKey].localTiming).toMatchObject({
      bpm: 128,
      numerator: 3,
      denominator: 4,
      loopBars: 2,
    });

    fireEvent.click(screen.getByText("Follow Arrangement"));
    expect(useAuthoringTransportStore.getState().sessions[sessionKey].clockSource).toBe(
      "arrangement",
    );
    rerender(
      <AuthoringTransportBar scope="effect" reference={reference} arrangement={arrangement} />,
    );
    expect(screen.queryByLabelText("Local BPM")).toBeNull();
  });

  it("shows an action-local structured Diagnostic with recovery", () => {
    const reference = projectActions.createEffect("Pulse")!;
    const state = useProjectStore.getState();
    const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;
    render(
      <AuthoringTransportBar scope="effect" reference={reference} arrangement={arrangement} />,
    );

    commitNumber("Local meter denominator", "3");
    expect(screen.getByRole("alert").textContent).toContain("AUTHORING_LOCAL_CLOCK_INVALID");
    expect(screen.getByRole("alert").textContent).toContain("power-of-two denominator");
    fireEvent.click(screen.getByRole("button", { name: /Reset preview/ }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the playhead BPM and meter from complete Arrangement maps", () => {
    const state = useProjectStore.getState();
    const reference = state.selectedArrangementRef;
    const arrangement = structuredClone(exactAsset(state.bundle.arrangements, reference)!);
    arrangement.tempo_map.points.push({ time_tick: 7_680, bpm: 96 });
    arrangement.time_signatures.push({
      time_tick: 7_680,
      numerator: 3,
      denominator: 4,
    });
    const sessionKey = authoringSessionKey("arrangement", assetKey(reference));
    authoringTransportActions.ensureSession({
      key: sessionKey,
      scope: "arrangement",
      durationTicks: arrangement.length_ticks,
    });
    authoringTransportActions.seek(sessionKey, 8_640);

    render(
      <AuthoringTransportBar scope="arrangement" reference={reference} arrangement={arrangement} />,
    );

    expect(screen.getByText("96 BPM")).toBeTruthy();
    expect(screen.getByText("3/4")).toBeTruthy();
    expect(screen.getByText("3.2.000")).toBeTruthy();
  });

  it("keeps the live timing readouts at fixed widths", () => {
    const reference = projectActions.createEffect("Pulse")!;
    const state = useProjectStore.getState();
    const arrangement = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;

    render(
      <AuthoringTransportBar scope="effect" reference={reference} arrangement={arrangement} />,
    );

    expect(screen.getByText("128 BPM").className).toContain("w-18");
    expect(screen.getByText("4/4").className).toContain("w-10");
    expect(screen.getByLabelText("Musical position").className).toContain("w-18");
    expect(screen.getByLabelText("Beat 1 of 4").className).toContain("w-14");
  });
});

function commitNumber(label: string, value: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}
