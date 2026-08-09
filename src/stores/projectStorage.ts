import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import type { ProjectBundle } from "@/bridge/types";
import { engine, type ProjectStorageSaveResult } from "@/bridge/commands";
import { projectActions, useProjectStore } from "@/stores/project";

export const PROJECT_STORAGE_SAVE_DELAY_MS = 2_000;

export type ProjectStoragePhase = "booting" | "needs_directory" | "loading" | "ready" | "error";

export interface ProjectStorageState {
  phase: ProjectStoragePhase;
  directory: string | null;
  attemptedDirectory: string | null;
  latestPath: string | null;
  historyCount: number;
  lastSavedAt: number | null;
  isSaving: boolean;
  error: string | null;
}

const initialState: ProjectStorageState = {
  phase: "booting",
  directory: null,
  attemptedDirectory: null,
  latestPath: null,
  historyCount: 0,
  lastSavedAt: null,
  isSaving: false,
  error: null,
};

export const useProjectStorageStore = create<ProjectStorageState>(() => initialState);

let activationSequence = 0;
let bootstrapPromise: Promise<void> | null = null;

export const projectStorageActions = {
  initialize: () => {
    if (useProjectStorageStore.getState().phase !== "booting") return Promise.resolve();
    if (bootstrapPromise) return bootstrapPromise;
    bootstrapPromise = (async () => {
      try {
        const cachedDirectory = (await engine.loadProjectStoragePreference())?.trim();
        if (!cachedDirectory) {
          useProjectStorageStore.setState({ phase: "needs_directory" });
          return;
        }
        await projectStorageActions.activateDirectory(cachedDirectory, true);
      } catch (error) {
        await engine.clearProjectStoragePreference().catch(() => undefined);
        useProjectStorageStore.setState({
          phase: "error",
          error: errorMessage(error, "The saved project folder preference could not be opened."),
        });
      }
    })().finally(() => {
      bootstrapPromise = null;
    });
    return bootstrapPromise;
  },

  chooseDirectory: async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose Lumina project folder",
    });
    if (typeof selected !== "string") return false;
    return projectStorageActions.activateDirectory(selected, false);
  },

  activateDirectory: async (directory: string, fromCache = false) => {
    const sequence = ++activationSequence;
    useProjectStorageStore.setState({
      phase: "loading",
      attemptedDirectory: directory,
      isSaving: false,
      error: null,
    });
    try {
      const loaded = await engine.loadProjectStorage(directory);
      if (sequence !== activationSequence) return false;

      if (loaded) {
        projectActions.loadBundle(loaded.project);
        await engine.saveProjectStoragePreference(directory);
        useProjectStorageStore.setState({
          phase: "ready",
          directory,
          attemptedDirectory: null,
          latestPath: loaded.latest_path,
          historyCount: loaded.history_count,
          lastSavedAt: null,
          isSaving: false,
          error: null,
        });
        return true;
      }

      const saved = await engine.saveProjectStorage(directory, useProjectStore.getState().bundle);
      if (sequence !== activationSequence) return false;
      await engine.saveProjectStoragePreference(directory);
      applySaveResult(directory, saved);
      return true;
    } catch (error) {
      if (sequence !== activationSequence) return false;
      if (fromCache) await engine.clearProjectStoragePreference().catch(() => undefined);
      useProjectStorageStore.setState({
        phase: "error",
        directory: null,
        attemptedDirectory: directory,
        latestPath: null,
        historyCount: 0,
        isSaving: false,
        error: errorMessage(error, "The project folder could not be opened."),
      });
      return false;
    }
  },

  saveBundle: async (directory: string, bundle: ProjectBundle) => {
    const state = useProjectStorageStore.getState();
    if (state.phase !== "ready" || state.directory !== directory) return false;
    useProjectStorageStore.setState({ isSaving: true, error: null });
    try {
      const saved = await engine.saveProjectStorage(directory, bundle);
      const latest = useProjectStorageStore.getState();
      if (latest.directory !== directory) return false;
      applySaveResult(directory, saved);
      return true;
    } catch (error) {
      const latest = useProjectStorageStore.getState();
      if (latest.directory !== directory) return false;
      useProjectStorageStore.setState({
        phase: "error",
        attemptedDirectory: directory,
        isSaving: false,
        error: errorMessage(error, "The project could not be saved."),
      });
      return false;
    }
  },

  retrySave: async () => {
    const state = useProjectStorageStore.getState();
    const directory = state.directory ?? state.attemptedDirectory;
    if (!directory) return false;
    useProjectStorageStore.setState({
      phase: "ready",
      directory,
      attemptedDirectory: null,
      error: null,
    });
    return projectStorageActions.saveBundle(directory, useProjectStore.getState().bundle);
  },
};

function applySaveResult(directory: string, result: ProjectStorageSaveResult) {
  useProjectStorageStore.setState({
    phase: "ready",
    directory,
    attemptedDirectory: null,
    latestPath: result.latest_path,
    historyCount: result.history_count,
    lastSavedAt: result.changed ? Date.now() : useProjectStorageStore.getState().lastSavedAt,
    isSaving: false,
    error: null,
  });
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
}

export interface ProjectAutosaveControllerOptions {
  getBundle: () => ProjectBundle;
  getStorage: () => ProjectStorageState;
  save: (directory: string, bundle: ProjectBundle) => Promise<unknown>;
  subscribe: (
    listener: (
      state: ReturnType<typeof useProjectStore.getState>,
      previous: ReturnType<typeof useProjectStore.getState>,
    ) => void,
  ) => () => void;
  delayMs?: number;
}

export class ProjectAutosaveController {
  private readonly options: ProjectAutosaveControllerOptions;
  private readonly unsubscribe: () => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queued: { directory: string; bundle: ProjectBundle } | null = null;
  private draining = false;
  private disposed = false;

  constructor(options: ProjectAutosaveControllerOptions) {
    this.options = options;
    this.unsubscribe = options.subscribe((state, previous) => {
      if (state.bundle !== previous.bundle) this.schedule();
    });
  }

  dispose() {
    this.disposed = true;
    this.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queued = null;
  }

  private schedule() {
    const storage = this.options.getStorage();
    if (storage.phase !== "ready" || !storage.directory) return;
    if (this.timer) clearTimeout(this.timer);
    const scheduledDirectory = storage.directory;
    this.timer = setTimeout(() => {
      this.timer = null;
      const latest = this.options.getStorage();
      if (this.disposed || latest.phase !== "ready" || latest.directory !== scheduledDirectory) {
        return;
      }
      this.queued = { directory: scheduledDirectory, bundle: this.options.getBundle() };
      void this.drain();
    }, this.options.delayMs ?? PROJECT_STORAGE_SAVE_DELAY_MS);
  }

  private async drain() {
    if (this.draining || this.disposed) return;
    this.draining = true;
    try {
      while (this.queued && !this.disposed) {
        const queued = this.queued;
        this.queued = null;
        const storage = this.options.getStorage();
        if (storage.phase !== "ready" || storage.directory !== queued.directory) continue;
        await this.options.save(queued.directory, queued.bundle);
      }
    } finally {
      this.draining = false;
    }
  }
}

export function createProjectAutosaveController() {
  return new ProjectAutosaveController({
    getBundle: () => useProjectStore.getState().bundle,
    getStorage: () => useProjectStorageStore.getState(),
    save: projectStorageActions.saveBundle,
    subscribe: useProjectStore.subscribe,
  });
}

export const projectStorageSelectors = {
  phase: (state: ProjectStorageState) => state.phase,
  directory: (state: ProjectStorageState) => state.directory,
  latestPath: (state: ProjectStorageState) => state.latestPath,
  historyCount: (state: ProjectStorageState) => state.historyCount,
  lastSavedAt: (state: ProjectStorageState) => state.lastSavedAt,
  isSaving: (state: ProjectStorageState) => state.isSaving,
  error: (state: ProjectStorageState) => state.error,
};
