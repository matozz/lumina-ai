import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { engineActions, useEngineStore } from "@/stores/engine";
import { projectActions } from "@/stores/project";
import { workspaceActions } from "@/stores/workspace";
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

describe("WorkspaceHeader revision boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    workspaceActions.reset();
    projectActions.reset();
    workspaceActions.setSnapshotState({ published_revision: 1, live_revision: 1 });
    engineActions.loadCurrentDslCode(JSON.stringify(createStarterProject()));
    useEngineStore.setState({ compileStatus: "success" });
  });

  it("publishes a Draft without changing Live until Take live is explicit", async () => {
    render(
      <TooltipProvider>
        <WorkspaceHeader />
      </TooltipProvider>,
    );

    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Take live" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(commandMocks.publishProject).toHaveBeenCalledOnce());
    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Take live" }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    fireEvent.click(screen.getByRole("button", { name: "Take live" }));

    await waitFor(() => expect(commandMocks.activateShowRevision).toHaveBeenCalledWith(2));
    expect(screen.getByText("Live")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Take live" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
