import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { LiveEffectInfo } from "@/bridge/types";
import { useEngineStore } from "@/stores/engine";
import { workspaceActions, useWorkspaceStore } from "@/stores/workspace";
import { LivePadSettings } from "./LivePadSettings";

const liveEffect: LiveEffectInfo = {
  instance_id: "pulse-instance",
  definition_id: "pulse",
  definition_revision: 1,
  name: "Red Pulse",
  target_group_id: "all-fixtures",
};

describe("LivePadSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    workspaceActions.reset();
    useEngineStore.setState(useEngineStore.getInitialState(), true);
  });

  it("edits behavior, exclusive group, and bounded one-shot duration", () => {
    render(<LivePadSettings effects={[liveEffect]} selectedEffectId={liveEffect.instance_id} />);

    fireEvent.click(screen.getByLabelText("Live Pad behavior"));
    fireEvent.mouseMove(screen.getByRole("option", { name: "One-shot" }));
    fireEvent.click(screen.getByRole("option", { name: "One-shot" }));
    fireEvent.change(screen.getByLabelText("Exclusive group"), {
      target: { value: "color" },
    });
    fireEvent.change(screen.getByLabelText("One-shot beats"), { target: { value: "512" } });

    expect(useWorkspaceStore.getState().livePadConfigs[liveEffect.instance_id]).toEqual({
      mode: "one_shot",
      exclusiveGroup: "color",
      oneShotBeats: 256,
    });
  });

  it("keeps internal revision comparisons out of the Live controls", () => {
    render(<LivePadSettings effects={[liveEffect]} selectedEffectId={liveEffect.instance_id} />);

    expect(screen.queryByText(/Draft|revision/i)).toBeNull();
    expect(screen.getByText(/Fixtures: all-fixtures/)).toBeTruthy();
  });
});
