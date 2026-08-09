import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStorageStore } from "@/stores/projectStorage";
import { ProjectStorageBoundary } from "./ProjectStorageBoundary";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

describe("ProjectStorageBoundary", () => {
  beforeEach(() => {
    useProjectStorageStore.setState(
      {
        phase: "needs_directory",
        directory: null,
        attemptedDirectory: null,
        latestPath: null,
        historyCount: 0,
        lastSavedAt: null,
        isSaving: false,
        error: null,
      },
      true,
    );
  });

  it("keeps authoring gated until a project folder is ready", () => {
    render(
      <ProjectStorageBoundary>
        <button>Editor action</button>
      </ProjectStorageBoundary>,
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose folder" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();

    act(() => useProjectStorageStore.setState({ phase: "ready", directory: "/shows" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Editor action" })).toBeTruthy();
  });

  it("does not block authoring for a save error after the folder is ready", () => {
    useProjectStorageStore.setState({
      phase: "ready",
      directory: "/shows",
      error: "temporary save failure",
    });

    render(
      <ProjectStorageBoundary>
        <button>Editor action</button>
      </ProjectStorageBoundary>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Editor action" })).toBeTruthy();
  });
});
