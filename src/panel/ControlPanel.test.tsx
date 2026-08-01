import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineActions, useEngineStore } from "@/stores/engine";
import { ControlPanel } from "./ControlPanel";

const commandMocks = vi.hoisted(() => ({
  pause: vi.fn().mockResolvedValue(undefined),
  play: vi.fn().mockResolvedValue(undefined),
  setSequencerMode: vi.fn().mockResolvedValue(undefined),
  setTempo: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  stopPhaser: vi.fn().mockResolvedValue(undefined),
  triggerPhaser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/bridge/commands", () => ({ engine: commandMocks }));

describe("ControlPanel transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEngineStore.setState({
      activePhasers: [],
      compileErrors: [],
      compileResult: null,
      compileStatus: "idle",
      currentDslCode: "",
      globalBeat: 0,
      parsedDsl: null,
      sequencerMode: "live",
      tempo: 120,
      transportRevision: 0,
      transportState: "stopped",
    });
  });

  it("exposes focusable native buttons with distinct Play, Pause, and Stop commands", async () => {
    render(<ControlPanel />);

    const play = screen.getByRole("button", { name: "PLAY" });
    play.focus();
    expect(document.activeElement).toBe(play);
    fireEvent.click(play);
    await waitFor(() => expect(commandMocks.play).toHaveBeenCalledOnce());

    act(() => engineActions.setTransport("playing", 1));
    const pause = screen.getByRole("button", { name: "PAUSE" });
    pause.focus();
    expect(document.activeElement).toBe(pause);
    fireEvent.click(pause);
    await waitFor(() => expect(commandMocks.pause).toHaveBeenCalledOnce());

    const stop = screen.getByTitle("Stop and Return to Start");
    stop.focus();
    expect(document.activeElement).toBe(stop);
    fireEvent.click(stop);
    await waitFor(() => expect(commandMocks.stop).toHaveBeenCalledOnce());
  });

  it("stops transport before switching from Live Pad to Timeline", async () => {
    render(<ControlPanel />);

    fireEvent.click(screen.getByRole("button", { name: "TIMELINE" }));

    await waitFor(() => {
      expect(commandMocks.stop).toHaveBeenCalledOnce();
      expect(commandMocks.setSequencerMode).toHaveBeenCalledWith("timeline");
    });
    expect(useEngineStore.getState().sequencerMode).toBe("timeline");
  });
});
