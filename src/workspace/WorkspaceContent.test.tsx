import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectActions } from "@/stores/project";
import { workspaceActions } from "@/stores/workspace";
import { WorkspaceContent } from "./WorkspaceContent";

vi.mock("@/canvas/CanvasView", () => ({
  CanvasView: ({ showIntensityWithoutColor }: { showIntensityWithoutColor?: boolean }) => (
    <div data-testid="canvas" data-intensity-visualization={showIntensityWithoutColor} />
  ),
}));
vi.mock("@/authoring/AuthoringTransportBar", () => ({
  AuthoringTransportBar: () => <div />,
}));
vi.mock("./arrange/ArrangementTimeline", () => ({ ArrangementTimeline: () => <div /> }));
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div />,
}));

describe("WorkspaceContent", () => {
  beforeEach(() => {
    projectActions.reset();
    workspaceActions.reset();
  });

  it("visualizes intensity-only output on the Arrange canvas", () => {
    render(<WorkspaceContent workspace="arrange" />);

    expect(screen.getByTestId("canvas").dataset.intensityVisualization).toBe("true");
  });

  it("shows Arrange preview failures instead of leaving a silent blank canvas", () => {
    projectActions.setPreviewError("The selected Cue revision could not be compiled.");

    render(<WorkspaceContent workspace="arrange" />);

    expect(screen.getByRole("alert").textContent).toContain("Arrangement preview unavailable");
    expect(screen.getByRole("alert").textContent).toContain(
      "The selected Cue revision could not be compiled.",
    );
  });

  it("compresses the preview and gives Timeline the remaining height in focus mode", () => {
    workspaceActions.setArrangeTimelineFocus(true);
    const { container } = render(<WorkspaceContent workspace="arrange" />);

    expect(container.querySelector("[data-arrange-focus-mode]")).toBeTruthy();
    expect(container.querySelector("[data-arrange-preview-compact]")).toBeTruthy();
    expect(screen.queryByTestId("canvas")).toBeNull();
  });
});
