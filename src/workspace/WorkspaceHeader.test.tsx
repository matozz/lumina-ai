import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { engineActions, useEngineStore } from "@/stores/engine";
import { workspaceActions } from "@/stores/workspace";
import { createStarterProject } from "./defaultProject";
import { WorkspaceHeader } from "./WorkspaceHeader";

const commandMocks = vi.hoisted(() => ({
  activateShowRevision: vi.fn().mockResolvedValue({ published_revision: 2, live_revision: 2 }),
  publishDSL: vi.fn().mockResolvedValue({
    success: true,
    show_revision: 2,
    fixture_count: 16,
    layout_coords: [],
    group_names: ["All fixtures"],
    phasers: [],
    sequence_names: [],
    errors: [],
    warnings: [],
    migration_report: { from_version: 4, to_version: 4, changes: [] },
  }),
}));

vi.mock("@/bridge/commands", () => ({ engine: commandMocks }));

describe("WorkspaceHeader revision boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    workspaceActions.reset();
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

    expect(screen.getByText("Published r1")).toBeTruthy();
    expect(screen.getByText("Live r1")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Take live" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(commandMocks.publishDSL).toHaveBeenCalledOnce());
    expect(screen.getByText("Published r2")).toBeTruthy();
    expect(screen.getByText("Live r1")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Take live" }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    fireEvent.click(screen.getByRole("button", { name: "Take live" }));

    await waitFor(() => expect(commandMocks.activateShowRevision).toHaveBeenCalledWith(2));
    expect(screen.getByText("Live r2")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Take live" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
