import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineActions, useEngineStore } from "@/stores/engine";
import { workspaceActions } from "@/stores/workspace";
import { createStarterProject } from "./defaultProject";
import { createEffectPair } from "./effect-lab/effectFactory";
import { WorkspaceLibrary } from "./WorkspaceLibrary";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("Live workspace library", () => {
  beforeEach(() => {
    localStorage.clear();
    workspaceActions.reset();
    useEngineStore.setState(useEngineStore.getInitialState(), true);
  });

  it("shows only effects from the immutable Live Snapshot", () => {
    const draft = createStarterProject();
    const pair = createEffectPair(draft, "Draft-only Pulse");
    draft.effect_definitions.push(pair.definition);
    draft.effect_instances.push(pair.instance);
    engineActions.loadCurrentDslCode(JSON.stringify(draft));
    engineActions.setLiveEffects([
      {
        instance_id: "live-wash-instance",
        definition_id: "live-wash",
        definition_revision: 2,
        name: "Live Wash",
        target_group_id: "all-fixtures",
      },
    ]);

    render(<WorkspaceLibrary workspace="live" />);

    expect(screen.getByText("Live Wash")).toBeTruthy();
    expect(screen.queryByText("Draft-only Pulse")).toBeNull();
    expect(screen.getByText("r2")).toBeTruthy();
  });
});
