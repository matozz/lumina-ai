import { useEffect, useRef } from "react";
import { CanvasRenderer } from "./CanvasRenderer";
import { onFrameUpdate } from "../bridge/events";
import { engine } from "../bridge/commands";
import { assessFrame, type FrameCursor } from "../bridge/frameSync";
import type { FixtureFramePayload, LayoutCoord } from "../bridge/types";
import type { ProjectPreviewFrame } from "../bridge/types";
import { cn } from "../lib/utils";

export const CanvasView = ({ frameSource = "live" }: { frameSource?: "preview" | "live" }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const frameCursorRef = useRef<FrameCursor | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const renderer = new CanvasRenderer(canvasRef.current);
    rendererRef.current = renderer;
    renderer.startRenderLoop();

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
      if (frameSource !== "preview") return;
      const frame = (event as CustomEvent<ProjectPreviewFrame>).detail;
      renderer.initFromLayout(frame.layout_coords);
      renderer.applyFrame(frame.outputs, true);
    };
    window.addEventListener("engine:project-preview-frame", handleProjectPreview);

    return () => {
      renderer.stopRenderLoop();
      unlistenPromise.then((fn) => fn());
      window.removeEventListener("engine:project-preview-frame", handleProjectPreview);
    };
  }, [frameSource]);

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
      rendererRef.current?.applyFrame((event as CustomEvent<FixtureFramePayload[]>).detail, true);
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
  }, [frameSource]);

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
