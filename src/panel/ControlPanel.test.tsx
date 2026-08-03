import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveEffectInfo } from "@/bridge/types";
import { engineActions, useEngineStore } from "@/stores/engine";
import { workspaceActions } from "@/stores/workspace";
import { LivePadGrid } from "@/workspace/live/LivePadGrid";
import { LiveTransportControls } from "@/workspace/live/LiveTransportControls";

const commandMocks = vi.hoisted(() => ({
  pause: vi.fn().mockResolvedValue(undefined),
  play: vi.fn().mockResolvedValue(undefined),
  queueLivePad: vi.fn().mockResolvedValue({ target_beat: 4 }),
  setBlackout: vi.fn().mockResolvedValue(undefined),
  setSequencerMode: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/bridge/commands", () => ({ engine: commandMocks }));

const redPulse: LiveEffectInfo = {
  instance_id: "red-pulse-instance",
  definition_id: "red-pulse",
  definition_revision: 2,
  name: "Red Pulse",
  target_group_id: "all-fixtures",
};

const blueWash: LiveEffectInfo = {
  instance_id: "blue-wash-instance",
  definition_id: "blue-wash",
  definition_revision: 1,
  name: "Blue Wash",
  target_group_id: "all-fixtures",
};

describe("Live/Rehearse controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    workspaceActions.reset();
    useEngineStore.setState(useEngineStore.getInitialState(), true);
  });

  it("keeps Play, Pause, Stop, and Blackout as distinct focusable commands", async () => {
    render(<LiveTransportControls />);

    const play = screen.getByRole("button", { name: "Play rehearsal" });
    const blackout = screen.getByRole("button", { name: "Blackout" });
    play.focus();
    expect(document.activeElement).toBe(play);
    fireEvent.click(play);
    await waitFor(() => expect(commandMocks.play).toHaveBeenCalledOnce());

    act(() => engineActions.setTransport("playing", 1));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    fireEvent.click(blackout);

    await waitFor(() => {
      expect(commandMocks.pause).toHaveBeenCalledOnce();
      expect(commandMocks.stop).toHaveBeenCalledOnce();
      expect(commandMocks.setBlackout).toHaveBeenCalledWith(true);
    });
    expect(blackout.getAttribute("aria-pressed")).toBe("false");
  });

  it("queues toggle pads on the selected grid without frontend timers", async () => {
    useEngineStore.setState({ transportState: "playing", liveEffects: [redPulse] });
    render(<LivePadGrid effects={[redPulse]} />);

    fireEvent.click(screen.getByRole("button", { name: "Red Pulse, Toggle Live Pad" }));

    await waitFor(() =>
      expect(commandMocks.queueLivePad).toHaveBeenCalledWith({
        effectId: redPulse.instance_id,
        action: "start",
        quantize: "beat",
        exclusiveIds: [],
        oneShotBeats: undefined,
      }),
    );
    expect(screen.getByText("@ 4")).toBeTruthy();
  });

  it("supports momentary release and one-shot exclusive groups", async () => {
    useEngineStore.setState({ transportState: "playing", liveEffects: [redPulse, blueWash] });
    workspaceActions.setLivePadConfig(redPulse.instance_id, {
      mode: "momentary",
      exclusiveGroup: "front",
      oneShotBeats: 4,
    });
    workspaceActions.setLivePadConfig(blueWash.instance_id, {
      mode: "one_shot",
      exclusiveGroup: "front",
      oneShotBeats: 8,
    });
    render(<LivePadGrid effects={[redPulse, blueWash]} />);

    const momentary = screen.getByRole("button", { name: "Red Pulse, Momentary Live Pad" });
    fireEvent.pointerDown(momentary, { button: 0, pointerId: 7 });
    fireEvent.pointerUp(momentary, { pointerId: 7 });
    fireEvent.click(screen.getByRole("button", { name: "Blue Wash, One-shot Live Pad" }));

    await waitFor(() => expect(commandMocks.queueLivePad).toHaveBeenCalledTimes(3));
    expect(commandMocks.queueLivePad).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ effectId: redPulse.instance_id, action: "start" }),
    );
    expect(commandMocks.queueLivePad).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ effectId: redPulse.instance_id, action: "stop" }),
    );
    expect(commandMocks.queueLivePad).toHaveBeenNthCalledWith(3, {
      effectId: blueWash.instance_id,
      action: "start",
      quantize: "beat",
      exclusiveIds: [redPulse.instance_id],
      oneShotBeats: 8,
    });
  });
});
