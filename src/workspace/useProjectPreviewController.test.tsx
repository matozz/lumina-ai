import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectActions } from "@/stores/project";
import { workspaceActions } from "@/stores/workspace";
import { useProjectPreviewController } from "./useProjectPreviewController";

const commandMocks = vi.hoisted(() => ({
  previewLayout: vi.fn(),
  previewProject: vi.fn(),
  renderProjectPreview: vi.fn(),
}));

vi.mock("@/bridge/commands", () => ({ engine: commandMocks }));

describe("Stage preview controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    projectActions.reset();
    workspaceActions.setInspectorVisible(true);
    commandMocks.previewLayout.mockResolvedValue([
      { id: 1, x: 0, y: 0, type: "pixel", width: 12, height: 12, patched: true },
    ]);
  });

  it("keeps the selected Layout on Canvas when the Stage inspector is hidden", async () => {
    const previewEvent = vi.fn();
    window.addEventListener("engine:layout-draft-coords", previewEvent);
    renderHook(() => useProjectPreviewController("stage"));

    expect(commandMocks.previewLayout).not.toHaveBeenCalled();
    act(() => workspaceActions.setInspectorVisible(false));

    await waitFor(() => expect(commandMocks.previewLayout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(previewEvent).toHaveBeenCalledTimes(1));
    window.removeEventListener("engine:layout-draft-coords", previewEvent);
  });
});
