import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  builtinArrangements,
  builtinEffects,
  builtinLayouts,
  builtinProjectTemplate,
} from "@/catalog/builtinCatalog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { engineActions, useEngineStore } from "@/stores/engine";
import { projectActions, useProjectStore } from "@/stores/project";
import { useProjectStorageStore } from "@/stores/projectStorage";
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

const assetPackFileMocks = vi.hoisted(() => ({
  downloadUserAssetPack: vi.fn(),
  readUserAssetPackFile: vi.fn(),
}));

vi.mock("@/bridge/commands", () => ({ engine: commandMocks }));
vi.mock("@/document/userAssetPackFile", () => assetPackFileMocks);

describe("WorkspaceHeader live workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    workspaceActions.reset();
    projectActions.reset();
    workspaceActions.setSnapshotState({ published_revision: 1, live_revision: 1 });
    engineActions.loadCurrentDslCode(JSON.stringify(createStarterProject()));
    useEngineStore.setState({ compileStatus: "success" });
    useProjectStorageStore.setState(
      {
        phase: "ready",
        directory: "/Users/tester/Documents/Lumina Shows/House",
        attemptedDirectory: null,
        latestPath: "/Users/tester/Documents/Lumina Shows/House/lumina-project.json",
        historyCount: 12,
        lastSavedAt: null,
        isSaving: false,
        error: null,
      },
      true,
    );
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
    expect(state.bundle.effects.map((effect) => effect.id)).toEqual(
      expect.arrayContaining([
        "builtin.color.dual-sweep",
        "builtin.intensity.breathe",
        "builtin.spatial.column-ping-pong",
        "builtin.spatial.column-rain",
      ]),
    );
    expect(state.bundle.effects.some((effect) => effect.name === "Accidental local effect")).toBe(
      false,
    );
    expect(state.bundle.stages[0].patch[0].id_range).toEqual([1, 400]);
    expect(useWorkspaceStore.getState()).toMatchObject({
      activeWorkspace: "stage",
      publishedRevision: 1,
      liveRevision: 1,
    });
    expect(commandMocks.publishProject).not.toHaveBeenCalled();
  });

  it("shows the selected project folder and retained history in Assets", async () => {
    render(
      <TooltipProvider>
        <WorkspaceHeader />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Assets" }));

    expect(await screen.findByText("…/Documents/Lumina Shows/House")).toBeTruthy();
    expect(screen.getByText("12 of 50 recent versions")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change project folder" })).toBeTruthy();
  });

  it("renames the current Project from Assets on the edit boundary", async () => {
    render(
      <TooltipProvider>
        <WorkspaceHeader />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Assets" }));
    const input = await screen.findByRole("textbox", { name: "Project name" });
    fireEvent.change(input, { target: { value: "Festival Project" } });
    expect(useProjectStore.getState().bundle.manifest.name).toBe("Lighting Project");

    fireEvent.blur(input);

    const state = useProjectStore.getState();
    expect(state.bundle.manifest.name).toBe("Festival Project");
    expect(state.history[state.history.length - 1]?.label).toBe("Rename Project");
    expect(useWorkspaceStore.getState().statusMessage).toBe("Project name updated.");
  });

  it("downloads the source-controlled built-in assets as the stable base pack", async () => {
    projectActions.renameProject("Customized Project");
    projectActions.createEffect("Project-only Effect");
    render(
      <TooltipProvider>
        <WorkspaceHeader />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Assets" }));
    fireEvent.click(await screen.findByRole("button", { name: "Export base asset pack" }));

    expect(assetPackFileMocks.downloadUserAssetPack).toHaveBeenCalledOnce();
    const pack = assetPackFileMocks.downloadUserAssetPack.mock.calls[0][0];
    expect(pack.name).toBe("Base Assets");
    expect(pack.source_project_id).toBe("builtin.project-template.authoring-starter");
    expect(pack.stages).toEqual([builtinProjectTemplate().stage]);
    expect(pack.layouts).toEqual(builtinLayouts);
    expect(pack.effects).toEqual(builtinEffects);
    expect(pack.cues).toEqual(builtinProjectTemplate().cues);
    expect(pack.cues).toEqual([]);
    expect(pack.arrangements).toEqual(builtinArrangements);
    expect(useWorkspaceStore.getState().statusMessage).toBe("Base asset pack downloaded.");
  });

  it("offers incremental import and keeps the current asset set", async () => {
    const pack = projectActions.exportBaseAssetPack();
    pack.effects[0].name = "Incoming Conflict Effect";
    const retained = projectActions.createEffect("Retained Local Effect")!;
    assetPackFileMocks.readUserAssetPackFile.mockResolvedValue(pack);

    render(
      <TooltipProvider>
        <WorkspaceHeader />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Assets" }));
    fireEvent.click(await screen.findByRole("button", { name: "Import asset pack" }));
    fireEvent.change(screen.getByLabelText("Choose Lumina asset pack"), {
      target: { files: [new File(["{}"], "incoming.lumina-assets.json")] },
    });

    expect(await screen.findByText("Choose asset import mode")).toBeTruthy();
    expect(screen.getByText(/Incoming Conflict Effect/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Replace all assets/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Incremental import/ }));

    await waitFor(() => expect(screen.queryByText("Choose asset import mode")).toBeNull());
    const state = useProjectStore.getState();
    expect(state.bundle.effects.some((effect) => effect.id === retained.id)).toBe(true);
    expect(
      state.bundle.effects.some((effect) => effect.id === `imported-${pack.effects[0].id}`),
    ).toBe(true);
    expect(state.history[state.history.length - 1]?.label).toBe("Import asset pack");
    expect(useWorkspaceStore.getState().statusMessage).toMatch(/imported incrementally/);
  });

  it("replaces all assets as a non-undoable reset while keeping the Project shell", async () => {
    const pack = projectActions.exportBaseAssetPack();
    pack.effects[0].name = "Replacement Effect";
    projectActions.renameProject("Resident Project");
    const discarded = projectActions.createEffect("Discarded Local Effect")!;
    projectActions.markPublished();
    const before = useProjectStore.getState();
    const projectId = before.bundle.manifest.project_id;
    const published = structuredClone(before.publishedBundle);
    assetPackFileMocks.readUserAssetPackFile.mockResolvedValue(pack);

    render(
      <TooltipProvider>
        <WorkspaceHeader />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Assets" }));
    fireEvent.click(await screen.findByRole("button", { name: "Import asset pack" }));
    fireEvent.change(screen.getByLabelText("Choose Lumina asset pack"), {
      target: { files: [new File(["{}"], "replacement.lumina-assets.json")] },
    });

    expect(await screen.findByText("Choose asset import mode")).toBeTruthy();
    expect(screen.getByText(/Replace cannot be undone/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Replace all assets/ }));

    await waitFor(() => expect(screen.queryByText("Choose asset import mode")).toBeNull());
    const state = useProjectStore.getState();
    expect(state.bundle.manifest).toMatchObject({
      project_id: projectId,
      name: "Resident Project",
    });
    expect(state.bundle.effects.some((effect) => effect.id === discarded.id)).toBe(false);
    expect(state.bundle.effects.some((effect) => effect.name === "Replacement Effect")).toBe(true);
    expect(state.publishedBundle).toEqual(published);
    expect(state.history).toHaveLength(0);
    expect(state.historyCursor).toBe(0);
    expect(state.savedHistoryCursor).toBe(-1);
    expect(useProjectStorageStore.getState().directory).toBe(
      "/Users/tester/Documents/Lumina Shows/House",
    );
  });

  it("shows autosave failures in Assets without blocking the workspace", async () => {
    useProjectStorageStore.setState({ error: "temporary save failure" });

    render(
      <TooltipProvider>
        <WorkspaceHeader />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Assets" }));

    expect(await screen.findByText("Last save failed. Editing is still available.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry save" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Choose a project folder" })).toBeNull();
  });
});
