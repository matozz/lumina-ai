import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { engineActions, useEngineStore } from "@/stores/engine";
import { projectActions, useProjectStore } from "@/stores/project";
import { useWorkspaceStore, workspaceActions } from "@/stores/workspace";
import { createStarterProject } from "./defaultProject";
import { WorkspaceHeader } from "./WorkspaceHeader";

const commandMocks = vi.hoisted(() => ({
  activateShowRevision: vi.fn().mockResolvedValue({ published_revision: 2, live_revision: 2 }),
  publishProject: vi.fn().mockResolvedValue({
    success: true,
    show_revision: 2,
    project_ref: { id: "lumina-project", revision: 1 },
    stage_ref: { id: "main-stage", revision: 1 },
    arrangement_ref: { id: "house-128", revision: 1 },
    fixture_count: 16,
    layout_coords: [],
    errors: [],
  }),
  getLiveEffects: vi.fn().mockResolvedValue({ show_revision: 2, effects: [] }),
}));

vi.mock("@/bridge/commands", () => ({ engine: commandMocks }));

describe("WorkspaceHeader live workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    workspaceActions.reset();
    projectActions.reset();
    workspaceActions.setSnapshotState({ published_revision: 1, live_revision: 1 });
    engineActions.loadCurrentDslCode(JSON.stringify(createStarterProject()));
    useEngineStore.setState({ compileStatus: "success" });
  });

  it("publishes and activates the current Arrangement through one Live action", async () => {
    render(
      <TooltipProvider>
        <WorkspaceHeader />
      </TooltipProvider>,
    );

    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Take live" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    await waitFor(() => expect(commandMocks.publishProject).toHaveBeenCalledOnce());
    await waitFor(() => expect(commandMocks.activateShowRevision).toHaveBeenCalledWith(2));
    expect(commandMocks.getLiveEffects).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Live" })).toBeTruthy();
    expect(useWorkspaceStore.getState().statusMessage).toBe("The current Arrangement is live.");
  });

  it("restores local authoring defaults without replacing current live output", () => {
    projectActions.createEffect("Accidental local effect");
    render(
      <TooltipProvider>
        <WorkspaceHeader />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("Restore default configuration?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore defaults" }));

    const state = useProjectStore.getState();
    expect(state.bundle.effects).toEqual([]);
    expect(state.bundle.stages[0].patch[0].id_range).toEqual([1, 80]);
    expect(useWorkspaceStore.getState()).toMatchObject({
      activeWorkspace: "stage",
      publishedRevision: 1,
      liveRevision: 1,
    });
    expect(commandMocks.publishProject).not.toHaveBeenCalled();
  });
});
