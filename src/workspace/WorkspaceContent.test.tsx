import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectActions } from "@/stores/project";
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
  beforeEach(() => projectActions.reset());

  it("visualizes intensity-only output on the Arrange canvas", () => {
    render(<WorkspaceContent workspace="arrange" />);

    expect(screen.getByTestId("canvas").dataset.intensityVisualization).toBe("true");
  });
});
