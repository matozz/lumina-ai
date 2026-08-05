import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectBundle } from "@/bridge/types";
import { activeStage, exactAsset } from "@/document/projectModel";
import { projectActions, useProjectStore } from "@/stores/project";
import { useWorkspaceStore, workspaceActions } from "@/stores/workspace";
import { ProjectStageInspector } from "./ProjectStageInspector";

const commandMocks = vi.hoisted(() => ({ previewLayout: vi.fn(), previewProject: vi.fn() }));

vi.mock("@/bridge/commands", () => ({ engine: commandMocks }));
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("ProjectStageInspector Layout workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    projectActions.reset();
    workspaceActions.setAdvancedMode(true);
    commandMocks.previewLayout.mockResolvedValue([]);
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
    await waitFor(() => expect(commandMocks.previewLayout).toHaveBeenCalled());
    const originalStageRef = structuredClone(useProjectStore.getState().bundle.manifest.stage_ref);
    const originalLayoutRef = structuredClone(
      activeStage(useProjectStore.getState().bundle).layout_ref,
    );

    fireEvent.change(screen.getByLabelText("Gap X"), { target: { value: "0" } });
    await waitFor(() => {
      const calls = commandMocks.previewLayout.mock.calls;
      const previewLayout = calls[calls.length - 1]?.[0] as ProjectBundle["layouts"][number];
      expect(previewLayout.geometry).toMatchObject({
        gap: { x: 0 },
        fixture_size: { width: 12 },
        pitch: { x: 12 },
      });
    });
    expect(activeStage(useProjectStore.getState().bundle).layout_ref).toEqual(originalLayoutRef);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const savedLayoutRef = useProjectStore.getState().selectedLayoutRef;
    expect(savedLayoutRef).toEqual({ id: originalLayoutRef.id, revision: 2 });
    expect(activeStage(useProjectStore.getState().bundle).layout_ref).toEqual(originalLayoutRef);

    fireEvent.click(screen.getByRole("button", { name: "Use on Stage" }));
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
    expect(useWorkspaceStore.getState().activeWorkspace).toBe("effect-lab");
  });

  it("continues from the active Stage to Effect selection in the simple workflow", async () => {
    workspaceActions.setAdvancedMode(false);
    render(<ProjectStageInspector />);
    await waitFor(() => expect(commandMocks.previewLayout).toHaveBeenCalled());

    expect(screen.queryByRole("button", { name: "Groups" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview Effects" }));
    expect(useWorkspaceStore.getState().activeWorkspace).toBe("effect-lab");
  });

  it("keeps an unsaved Layout Draft when Stage subviews update the bundle", async () => {
    render(<ProjectStageInspector />);
    await waitFor(() => expect(commandMocks.previewLayout).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Gap X"), { target: { value: "7.4" } });
    expect((screen.getByLabelText("Gap X") as HTMLInputElement).value).toBe("7");
    fireEvent.click(screen.getByRole("button", { name: "Groups" }));

    act(() => {
      projectActions.duplicateStageGroup("all-fixtures");
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Setup" }));
    const controls = screen.getByRole("region", { name: "Layout asset controls" });
    expect(within(controls).getByRole("button", { name: "Save" })).toBeTruthy();
    expect(within(controls).getByRole("button", { name: "Duplicate" })).toBeTruthy();
    expect((screen.getByLabelText("Gap X") as HTMLInputElement).value).toBe("7");
    expect(screen.getByText("Unsaved")).toBeTruthy();
  });

  it("opens Groups and fixture areas in expanded responsive dialogs", async () => {
    render(<ProjectStageInspector />);
    await waitFor(() => expect(commandMocks.previewLayout).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Groups" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Fixture Group editor")).toBeTruthy();
    expect(screen.getByRole("grid", { name: "Fixture Group membership" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Areas" }));
    expect(screen.getByText("Fixture area editor")).toBeTruthy();
    expect(screen.getByRole("grid", { name: "TargetSet fixture preview" })).toBeTruthy();
  });

  it("previews and saves a smaller Layout while reporting Stage capacity separately", async () => {
    render(<ProjectStageInspector />);
    await waitFor(() => expect(commandMocks.previewLayout).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Rows"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Columns"), { target: { value: "2" } });

    await waitFor(() => {
      const calls = commandMocks.previewLayout.mock.calls;
      const previewLayout = calls[calls.length - 1]?.[0] as ProjectBundle["layouts"][number];
      expect(previewLayout.geometry).toMatchObject({ rows: 2, columns: 2 });
    });
    expect(
      screen.getByText(/previews 4 positions while this Stage patches 16 fixtures/),
    ).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("shows Layout positions beyond the Stage patch and exposes patch configuration", async () => {
    render(<ProjectStageInspector />);
    await waitFor(() => expect(commandMocks.previewLayout).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Rows"), { target: { value: "5" } });
    expect(screen.getByText(/4 unpatched positions use dashed Canvas borders/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Stage patch: 16 fixtures/ }));

    expect(screen.getByText("Configure Stage patch")).toBeTruthy();
    expect(screen.getByText(/A 21×45 Layout contains 945 positions/)).toBeTruthy();
    expect(screen.getByText("Draft is not on Stage yet")).toBeTruthy();
    expect(screen.getByText(/This Draft has 20 positions/)).toBeTruthy();
    expect(screen.getByLabelText("Fixture count")).toHaveProperty("value", "16");
  });

  it("edits circles through rings, ring gap, and shared fixture size", async () => {
    const circleRef = useProjectStore
      .getState()
      .bundle.manifest.layout_refs.find((reference) => reference.id === "circle-16");
    expect(circleRef).toBeTruthy();
    act(() => projectActions.setSelectedLayoutRef(circleRef!));

    render(<ProjectStageInspector />);
    await waitFor(() => expect(commandMocks.previewLayout).toHaveBeenCalled());

    expect(screen.getByLabelText("Rings")).toBeTruthy();
    expect(screen.getByLabelText("Ring gap")).toBeTruthy();
    expect(screen.getByLabelText("Fixture width")).toBeTruthy();
    expect(screen.getByLabelText("Fixture height")).toBeTruthy();
    expect(screen.queryByLabelText("Ring increment")).toBeNull();
    expect(screen.queryByLabelText("Ring pitch")).toBeNull();

    fireEvent.change(screen.getByLabelText("Rings"), { target: { value: "2" } });
    await waitFor(() => {
      const calls = commandMocks.previewLayout.mock.calls;
      const previewLayout = calls[calls.length - 1]?.[0] as ProjectBundle["layouts"][number];
      expect(previewLayout.geometry).toMatchObject({
        shape: "circle",
        rings: 2,
        increment: 5,
      });
    });
  });

  it("previews an individual fixture size override and clears it on all-fixture edits", async () => {
    render(<ProjectStageInspector />);
    await waitFor(() => expect(commandMocks.previewLayout).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Fixture 1 width"), { target: { value: "23.6" } });
    await waitFor(() => {
      const calls = commandMocks.previewLayout.mock.calls;
      const previewLayout = calls[calls.length - 1]?.[0] as ProjectBundle["layouts"][number];
      expect(previewLayout.fixture_size_overrides).toEqual([
        { fixture_id: 1, size: { width: 24, height: 12 } },
      ]);
    });

    fireEvent.change(screen.getByLabelText("Fixture width"), { target: { value: "20" } });
    await waitFor(() => {
      const calls = commandMocks.previewLayout.mock.calls;
      const previewLayout = calls[calls.length - 1]?.[0] as ProjectBundle["layouts"][number];
      expect(previewLayout.fixture_size_overrides).toBeUndefined();
      expect(previewLayout.geometry).toMatchObject({ fixture_size: { width: 20, height: 12 } });
    });
  });
});
