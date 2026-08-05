import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { LiveEffectInfo } from "@/bridge/types";
import { engineActions, useEngineStore } from "@/stores/engine";
import { workspaceActions, useWorkspaceStore } from "@/stores/workspace";
import { createStarterProject } from "@/workspace/defaultProject";
import { createEffectPair } from "@/workspace/effect-lab/effectFactory";
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

    fireEvent.change(screen.getByLabelText("Live Pad behavior"), {
      target: { value: "one_shot" },
    });
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

  it("warns when Draft has a newer revision than the Live Snapshot", () => {
    const draft = createStarterProject();
    const pair = createEffectPair(draft);
    pair.definition.id = liveEffect.definition_id;
    pair.definition.revision = 2;
    draft.effect_definitions.push(pair.definition);
    draft.effect_instances.push(pair.instance);
    engineActions.loadCurrentDslCode(JSON.stringify(draft));

    render(<LivePadSettings effects={[liveEffect]} selectedEffectId={liveEffect.instance_id} />);

    expect(screen.getByText("Draft newer")).toBeTruthy();
    expect(screen.getByText(/Fixtures: all-fixtures/)).toBeTruthy();
  });
});
