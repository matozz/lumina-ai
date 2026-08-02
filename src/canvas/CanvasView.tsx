import { useEffect, useRef } from "react";
import { CanvasRenderer } from "./CanvasRenderer";
import { onFrameUpdate } from "../bridge/events";
import { engine } from "../bridge/commands";
import { assessFrame, type FrameCursor } from "../bridge/frameSync";
import type { FixtureFramePayload, LayoutCoord } from "../bridge/types";
import { cn } from "../lib/utils";

export const CanvasView = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const frameCursorRef = useRef<FrameCursor | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const renderer = new CanvasRenderer(canvasRef.current);
    rendererRef.current = renderer;
    renderer.startRenderLoop();

    const unlistenPromise = onFrameUpdate((payload) => {
      const decision = assessFrame(frameCursorRef.current, payload);
      if (decision.requestFull) {
        void engine.requestFullFrame().catch(() => undefined);
      }
      if (!decision.accept) return;

      frameCursorRef.current = decision.next;
      renderer.applyFrame(payload.outputs, payload.full);
    });

    return () => {
      renderer.stopRenderLoop();
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  // Expose a way to init layout (e.g. from parent component or global event)
  useEffect(() => {
    const handleLayoutUpdate = async () => {
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

    window.addEventListener("engine:layout-ready", handleLayoutUpdate);
    window.addEventListener("engine:draft-layout", handleDraftLayout);
    window.addEventListener("workspace:test-fixtures", handleFixtureTest);
    return () => {
      window.removeEventListener("engine:layout-ready", handleLayoutUpdate);
      window.removeEventListener("engine:draft-layout", handleDraftLayout);
      window.removeEventListener("workspace:test-fixtures", handleFixtureTest);
    };
  }, []);

  return (
    <div className={cn("flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden")}>
      <canvas
        ref={canvasRef}
        className={cn("block h-full min-h-0 w-full min-w-0")}
        aria-label="Lighting canvas"
      />
    </div>
  );
};
