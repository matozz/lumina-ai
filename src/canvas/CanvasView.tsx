import { useEffect, useRef } from "react";
import { CanvasRenderer } from "./CanvasRenderer";
import { onFrameUpdate } from "../bridge/events";
import { engine } from "../bridge/commands";

export const CanvasView = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const renderer = new CanvasRenderer(canvasRef.current);
    rendererRef.current = renderer;
    renderer.startRenderLoop();

    const unlistenPromise = onFrameUpdate((payload) => {
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

    window.addEventListener("engine:layout-ready", handleLayoutUpdate);
    return () => window.removeEventListener("engine:layout-ready", handleLayoutUpdate);
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", flex: 1 }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
};
