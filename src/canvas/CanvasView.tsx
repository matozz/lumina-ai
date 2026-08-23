import { useEffect, useRef } from "react";
import { CanvasRenderer } from "./CanvasRenderer";
import { onFrameUpdate } from "../bridge/events";
import { engine } from "../bridge/commands";
import { assessFrame, type FrameCursor } from "../bridge/frameSync";
import type { FixtureFramePayload, LayoutCoord } from "../bridge/types";
import type { ProjectPreviewFrame } from "../bridge/types";
import { cn } from "../lib/utils";
import { latestAuthoringPreview } from "./previewBus";

const INTENSITY_PREVIEW_COLOR: [number, number, number] = [139, 119, 255];

export const CanvasView = ({
  frameSource = "live",
  showIntensityWithoutColor = false,
  layoutOnly = false,
}: {
  frameSource?: "preview" | "live";
  showIntensityWithoutColor?: boolean;
  layoutOnly?: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const frameCursorRef = useRef<FrameCursor | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const renderer = new CanvasRenderer(canvasRef.current);
    rendererRef.current = renderer;
    renderer.startRenderLoop();
    let projectLayoutGeneration: number | null = null;

    const applyProjectFrame = (frame: ProjectPreviewFrame) => {
      if (frame.generation !== projectLayoutGeneration && frame.layout_coords.length > 0) {
        renderer.initFromLayout(frame.layout_coords);
        projectLayoutGeneration = frame.generation;
      }
      renderer.applyFrame(
        frame.outputs,
        true,
        showIntensityWithoutColor ? INTENSITY_PREVIEW_COLOR : undefined,
      );
    };

    const unlistenPromise =
      frameSource === "live"
        ? onFrameUpdate((payload) => {
            const decision = assessFrame(frameCursorRef.current, payload);
            if (decision.requestFull) {
              void engine.requestFullFrame().catch(() => undefined);
            }
            if (!decision.accept) return;

            frameCursorRef.current = decision.next;
            renderer.applyFrame(payload.outputs, payload.full);
          })
        : Promise.resolve(() => undefined);

    const handleProjectPreview = (event: Event) => {
      if (frameSource !== "preview" || layoutOnly) return;
      const frame = (event as CustomEvent<ProjectPreviewFrame>).detail;
      applyProjectFrame(frame);
    };
    const handleLayoutDraft = (event: Event) => {
      if (frameSource !== "preview") return;
      projectLayoutGeneration = null;
      renderer.initFromLayout((event as CustomEvent<LayoutCoord[]>).detail, "layout-draft");
    };
    window.addEventListener("engine:project-preview-frame", handleProjectPreview);
    window.addEventListener("engine:layout-draft-coords", handleLayoutDraft);

    if (frameSource === "preview") {
      const snapshot = latestAuthoringPreview();
      if (snapshot?.type === "layout") {
        renderer.initFromLayout(snapshot.coords, "layout-draft");
      } else if (snapshot?.type === "project" && !layoutOnly) {
        applyProjectFrame(snapshot.frame);
      }
    }

    return () => {
      renderer.stopRenderLoop();
      unlistenPromise.then((fn) => fn());
      window.removeEventListener("engine:project-preview-frame", handleProjectPreview);
      window.removeEventListener("engine:layout-draft-coords", handleLayoutDraft);
    };
  }, [frameSource, layoutOnly, showIntensityWithoutColor]);

  // Expose a way to init layout (e.g. from parent component or global event)
  useEffect(() => {
    const handleLayoutUpdate = async () => {
      if (frameSource !== "live") return;
      const coords = await engine.getLayoutCoords();
      if (coords && coords.length > 0) {
        rendererRef.current?.initFromLayout(coords);
      }
    };

    const handleDraftLayout = (event: Event) => {
      rendererRef.current?.initFromLayout((event as CustomEvent<LayoutCoord[]>).detail);
    };
    const handleFixtureTest = (event: Event) => {
      rendererRef.current?.applyFrame(
        (event as CustomEvent<FixtureFramePayload[]>).detail,
        true,
        showIntensityWithoutColor ? INTENSITY_PREVIEW_COLOR : undefined,
      );
    };

    window.addEventListener("workspace:test-fixtures", handleFixtureTest);
    if (frameSource === "live") {
      window.addEventListener("engine:layout-ready", handleLayoutUpdate);
      window.addEventListener("engine:draft-layout", handleDraftLayout);
      void handleLayoutUpdate();
    }
    return () => {
      window.removeEventListener("engine:layout-ready", handleLayoutUpdate);
      window.removeEventListener("engine:draft-layout", handleDraftLayout);
      window.removeEventListener("workspace:test-fixtures", handleFixtureTest);
    };
  }, [frameSource, showIntensityWithoutColor]);

  return (
    <div className={cn("flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden")}>
      <canvas
        ref={canvasRef}
        className={cn("block h-full min-h-0 w-full min-w-0")}
        aria-label={frameSource === "live" ? "Live lighting canvas" : "Authoring preview canvas"}
      />
    </div>
  );
};
