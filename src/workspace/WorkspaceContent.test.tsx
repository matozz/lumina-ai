import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  ResizablePanel: ({
    children,
    defaultSize,
    id,
    minSize,
  }: {
    children: React.ReactNode;
    defaultSize?: string;
    id?: string;
    minSize?: string;
  }) => (
    <div data-testid={id} data-default-size={defaultSize} data-min-size={minSize}>
      {children}
    </div>
  ),
  ResizableHandle: ({ onKeyDownCapture }: React.ComponentProps<"div">) => (
    <div data-testid="arrange-resize-handle" onKeyDownCapture={onKeyDownCapture} />
  ),
}));

describe("WorkspaceContent", () => {
  const originalRequestFullscreen = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "requestFullscreen",
  );

  beforeEach(() => {
    projectActions.reset();
    workspaceActions.reset();
  });

  afterEach(() => {
    if (originalRequestFullscreen) {
      Object.defineProperty(HTMLElement.prototype, "requestFullscreen", originalRequestFullscreen);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
    }
  });

  it("visualizes intensity-only output on the Arrange canvas", () => {
    render(<WorkspaceContent workspace="arrange" />);

    expect(screen.getByTestId("canvas").dataset.intensityVisualization).toBe("true");
  });

  it("defaults to a compact Timeline while preserving a usable minimum height", () => {
    render(<WorkspaceContent workspace="arrange" />);

    expect(screen.getByTestId("arrange-preview").getAttribute("data-default-size")).toBe("68%");
    expect(screen.getByTestId("arrange-timeline").getAttribute("data-default-size")).toBe("32%");
    expect(screen.getByTestId("arrange-timeline").getAttribute("data-min-size")).toBe("12rem");
  });

  it("reserves Command/Ctrl plus vertical arrows for Timeline zoom", () => {
    render(<WorkspaceContent workspace="arrange" />);
    const handle = screen.getByTestId("arrange-resize-handle");
    const zoomIn = createEvent.keyDown(handle, {
      key: "ArrowUp",
      metaKey: true,
      cancelable: true,
    });
    const resize = createEvent.keyDown(handle, { key: "ArrowUp", cancelable: true });

    fireEvent(handle, zoomIn);
    fireEvent(handle, resize);

    expect(zoomIn.defaultPrevented).toBe(true);
    expect(resize.defaultPrevented).toBe(false);
  });

  it("shows Arrange preview failures instead of leaving a silent blank canvas", () => {
    projectActions.setPreviewError("The selected Cue revision could not be compiled.");

    render(<WorkspaceContent workspace="arrange" />);

    expect(screen.getByRole("alert").textContent).toContain("Arrangement preview unavailable");
    expect(screen.getByRole("alert").textContent).toContain(
      "The selected Cue revision could not be compiled.",
    );
  });

  it("expands the Arrangement preview surface through the fullscreen control", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    const { container } = render(<WorkspaceContent workspace="arrange" />);

    fireEvent.click(screen.getByRole("button", { name: "Enter preview fullscreen" }));

    await waitFor(() => {
      expect(requestFullscreen).toHaveBeenCalledOnce();
      expect(container.querySelector("[data-preview-fullscreen]")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Exit preview fullscreen" })).toBeTruthy();
    });
  });

  it("compresses the preview and gives Timeline the remaining height in focus mode", () => {
    workspaceActions.setArrangeTimelineFocus(true);
    const { container } = render(<WorkspaceContent workspace="arrange" />);

    expect(container.querySelector("[data-arrange-focus-mode]")).toBeTruthy();
    expect(container.querySelector("[data-arrange-preview-compact]")).toBeTruthy();
    expect(screen.queryByTestId("canvas")).toBeNull();
  });
});
