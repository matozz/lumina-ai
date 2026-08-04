import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectBundle } from "@/bridge/types";
import { activeStage, exactAsset } from "@/document/projectModel";
import { projectActions, useProjectStore } from "@/stores/project";
import { ProjectStageInspector } from "./ProjectStageInspector";

const commandMocks = vi.hoisted(() => ({ previewProject: vi.fn() }));

vi.mock("@/bridge/commands", () => ({ engine: commandMocks }));
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("ProjectStageInspector Layout workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    projectActions.reset();
    commandMocks.previewProject.mockImplementation(({ project }) =>
      Promise.resolve({
        generation: 1,
        source: { type: "authoring_draft" },
        context: { type: "stage" },
        project_ref: { id: project.manifest.project_id, revision: project.manifest.revision },
        stage_ref: project.manifest.stage_ref,
        arrangement_ref: project.manifest.arrangement_refs[0],
        playhead_tick: 0,
        layout_coords: [],
        outputs: [],
      }),
    );
  });

  it("previews an isolated zero-gap Draft and applies it only after impact confirmation", async () => {
    render(<ProjectStageInspector />);
    await waitFor(() => expect(commandMocks.previewProject).toHaveBeenCalled());
    const originalStageRef = structuredClone(useProjectStore.getState().bundle.manifest.stage_ref);
    const originalLayoutRef = structuredClone(
      activeStage(useProjectStore.getState().bundle).layout_ref,
    );

    fireEvent.change(screen.getByLabelText("Gap X"), { target: { value: "0" } });
    await waitFor(() => {
      const calls = commandMocks.previewProject.mock.calls;
      const project = calls[calls.length - 1]?.[0].project as ProjectBundle;
      const previewLayout = exactAsset(project.layouts, project.stages[0].layout_ref);
      expect(previewLayout?.geometry).toMatchObject({
        gap: { x: 0 },
        fixture_size: { width: 12 },
        pitch: { x: 12 },
      });
    });
    expect(activeStage(useProjectStore.getState().bundle).layout_ref).toEqual(originalLayoutRef);

    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    const savedLayoutRef = useProjectStore.getState().selectedLayoutRef;
    expect(savedLayoutRef).toEqual({ id: originalLayoutRef.id, revision: 2 });
    expect(activeStage(useProjectStore.getState().bundle).layout_ref).toEqual(originalLayoutRef);

    fireEvent.click(screen.getByRole("button", { name: /Review impact/ }));
    expect(screen.getByText("Compatible Stage upgrade")).toBeTruthy();
    expect(useProjectStore.getState().bundle.manifest.stage_ref).toEqual(originalStageRef);

    fireEvent.click(screen.getByRole("button", { name: "Upgrade Stage + listed dependents" }));
    const upgradedStage = activeStage(useProjectStore.getState().bundle);
    expect(upgradedStage.revision).toBe(2);
    expect(upgradedStage.layout_ref).toEqual(savedLayoutRef);
    expect(
      exactAsset(useProjectStore.getState().bundle.stages, originalStageRef)?.layout_ref,
    ).toEqual(originalLayoutRef);
    expect(useProjectStore.getState().publishedBundle).toBeNull();
  });
});
