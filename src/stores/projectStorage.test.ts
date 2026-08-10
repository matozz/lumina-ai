import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engine } from "@/bridge/commands";
import type { ProjectBundle } from "@/bridge/types";
import { projectActions, useProjectStore } from "@/stores/project";
import {
  ProjectAutosaveController,
  projectStorageActions,
  type ProjectStorageState,
  useProjectStorageStore,
} from "./projectStorage";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

describe("project folder storage", () => {
  beforeEach(() => {
    localStorage.clear();
    projectActions.reset();
    useProjectStorageStore.setState(storageState("booting"), true);
    vi.spyOn(engine, "loadProjectStoragePreference").mockResolvedValue(null);
    vi.spyOn(engine, "saveProjectStoragePreference").mockResolvedValue(undefined);
    vi.spyOn(engine, "clearProjectStoragePreference").mockResolvedValue(undefined);
  });

  it("blocks startup when no project folder has been selected", async () => {
    await projectStorageActions.initialize();

    expect(useProjectStorageStore.getState()).toMatchObject({
      phase: "needs_directory",
      directory: null,
    });
  });

  it("reopens the cached authoritative folder during startup", async () => {
    const project = structuredClone(useProjectStore.getState().bundle);
    project.manifest.name = "Reopened Project";
    vi.mocked(engine.loadProjectStoragePreference).mockResolvedValue("/remembered");
    vi.spyOn(engine, "loadProjectStorage").mockResolvedValue({
      project,
      latest_path: "/remembered/lumina-project.json",
      history_count: 3,
    });

    await projectStorageActions.initialize();

    expect(useProjectStore.getState().bundle.manifest.name).toBe("Reopened Project");
    expect(useProjectStorageStore.getState()).toMatchObject({
      phase: "ready",
      directory: "/remembered",
      historyCount: 3,
    });
  });

  it("opens the authoritative latest project and caches its folder", async () => {
    const project = structuredClone(useProjectStore.getState().bundle);
    project.manifest.name = "Folder Project";
    vi.spyOn(engine, "loadProjectStorage").mockResolvedValue({
      project,
      latest_path: "/shows/lumina-project.json",
      history_count: 7,
    });

    await projectStorageActions.activateDirectory("/shows");

    expect(useProjectStore.getState().bundle.manifest.name).toBe("Folder Project");
    expect(useProjectStorageStore.getState()).toMatchObject({
      phase: "ready",
      directory: "/shows",
      historyCount: 7,
    });
    expect(engine.saveProjectStoragePreference).toHaveBeenCalledWith("/shows");
  });

  it("initializes an empty folder from the current recovery bundle", async () => {
    const current = useProjectStore.getState().bundle;
    vi.spyOn(engine, "loadProjectStorage").mockResolvedValue(null);
    const save = vi.spyOn(engine, "saveProjectStorage").mockResolvedValue({
      latest_path: "/new/lumina-project.json",
      history_count: 0,
      changed: true,
    });

    await projectStorageActions.activateDirectory("/new");

    expect(save).toHaveBeenCalledWith("/new", current);
    expect(useProjectStorageStore.getState()).toMatchObject({
      phase: "ready",
      directory: "/new",
      latestPath: "/new/lumina-project.json",
    });
    expect(engine.saveProjectStoragePreference).toHaveBeenCalledWith("/new");
  });

  it("does not cache or overwrite a folder that fails to open", async () => {
    vi.spyOn(engine, "loadProjectStorage").mockRejectedValue(new Error("invalid latest"));
    const save = vi.spyOn(engine, "saveProjectStorage");

    await projectStorageActions.activateDirectory("/broken");

    expect(save).not.toHaveBeenCalled();
    expect(engine.saveProjectStoragePreference).not.toHaveBeenCalled();
    expect(useProjectStorageStore.getState()).toMatchObject({
      phase: "error",
      directory: null,
      attemptedDirectory: "/broken",
      error: "invalid latest",
    });
  });

  it("keeps authoring ready when an autosave fails", async () => {
    useProjectStorageStore.setState(storageState("ready", "/shows"), true);
    vi.spyOn(engine, "saveProjectStorage").mockRejectedValue(new Error("temporary save failure"));

    await projectStorageActions.saveBundle("/shows", useProjectStore.getState().bundle);

    expect(useProjectStorageStore.getState()).toMatchObject({
      phase: "ready",
      directory: "/shows",
      attemptedDirectory: null,
      isSaving: false,
      error: "temporary save failure",
    });
  });
});

describe("ProjectAutosaveController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves only the latest bundle two seconds after a burst of edits", async () => {
    let bundle = projectBundle("Initial");
    let listener:
      | ((state: { bundle: ProjectBundle }, previous: { bundle: ProjectBundle }) => void)
      | null = null;
    const save = vi.fn().mockResolvedValue(undefined);
    const controller = new ProjectAutosaveController({
      getBundle: () => bundle,
      getStorage: () => storageState("ready", "/shows"),
      save,
      subscribe: (next) => {
        listener = next as typeof listener;
        return () => undefined;
      },
    });
    const initial = bundle;
    bundle = projectBundle("First edit");
    listener!({ bundle }, { bundle: initial });
    await vi.advanceTimersByTimeAsync(1_500);
    const first = bundle;
    bundle = projectBundle("Latest edit");
    listener!({ bundle }, { bundle: first });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      "/shows",
      expect.objectContaining({ manifest: expect.objectContaining({ name: "Latest edit" }) }),
    );
    controller.dispose();
  });

  it("ignores selection-only state updates and serializes overlapping saves", async () => {
    let bundle = projectBundle("Initial");
    let listener:
      | ((state: { bundle: ProjectBundle }, previous: { bundle: ProjectBundle }) => void)
      | null = null;
    let finishFirst: (() => void) | null = null;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const controller = new ProjectAutosaveController({
      getBundle: () => bundle,
      getStorage: () => storageState("ready", "/shows"),
      save,
      subscribe: (next) => {
        listener = next as typeof listener;
        return () => undefined;
      },
    });

    listener!({ bundle }, { bundle });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(save).not.toHaveBeenCalled();

    const initial = bundle;
    bundle = projectBundle("First save");
    listener!({ bundle }, { bundle: initial });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(save).toHaveBeenCalledTimes(1);

    const first = bundle;
    bundle = projectBundle("Queued save");
    listener!({ bundle }, { bundle: first });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(save).toHaveBeenCalledTimes(1);
    finishFirst!();
    await Promise.resolve();
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[1].manifest.name).toBe("Queued save");
    controller.dispose();
  });
});

function storageState(
  phase: ProjectStorageState["phase"],
  directory: string | null = null,
): ProjectStorageState {
  return {
    phase,
    directory,
    attemptedDirectory: null,
    latestPath: directory ? `${directory}/lumina-project.json` : null,
    historyCount: 0,
    lastSavedAt: null,
    isSaving: false,
    error: null,
  };
}

function projectBundle(name: string) {
  const bundle = structuredClone(useProjectStore.getState().bundle);
  bundle.manifest.name = name;
  return bundle;
}
