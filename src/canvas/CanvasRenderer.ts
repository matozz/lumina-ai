import type { FixtureFramePayload, LayoutCoord } from "../bridge/types";
import { Camera } from "./Camera";
import { FixtureVisual } from "./FixtureVisual";
import { toPreviewOutput } from "./previewFrame";

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fixtures: Map<number, FixtureVisual>;
  private glowEnabled: boolean = true;
  private camera: Camera;
  private animationFrameId: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.fixtures = new Map();
    this.camera = new Camera(canvas);
  }

  initFromLayout(coords: LayoutCoord[]): void {
    this.fixtures.clear();
    for (const { id, x, y, type } of coords) {
      this.fixtures.set(id, new FixtureVisual(id, x, y, type));
    }
    this.camera.fitToContent(coords);
  }

  applyFrame(outputs: FixtureFramePayload[], _full: boolean): void {
    for (const frame of outputs) {
      const out = toPreviewOutput(frame);
      const visual = this.fixtures.get(out.id);
      if (visual) {
        visual.applyOutput(out.r, out.g, out.b, out.dimmer);
      }
    }
  }

  startRenderLoop(): void {
    const loop = () => {
      this.draw();

      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  stopRenderLoop(): void {
    cancelAnimationFrame(this.animationFrameId);
  }

  private draw(): void {
    const { ctx, canvas } = this;
    const { offsetX, offsetY, scale } = this.camera;

    // Fix DPI scaling
    const rect = canvas.getBoundingClientRect();
    const isResized = canvas.width !== rect.width || canvas.height !== rect.height;

    if (isResized) {
      canvas.width = rect.width;
      canvas.height = rect.height;
      // Re-center when canvas size changes
      this.camera.fitToContent(Array.from(this.fixtures.values()));
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // dark background
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    const batches = new Map<string, FixtureVisual[]>();
    for (const visual of this.fixtures.values()) {
      const hex = visual.currentColorHex;
      if (!batches.has(hex)) batches.set(hex, []);
      batches.get(hex)!.push(visual);
    }

    // Draw main bodies
    for (const [color, batch] of batches) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const v of batch) {
        if (v.type === "pixel") {
          // Draw square for pixels
          ctx.rect(v.x - v.radius, v.y - v.radius, v.radius * 2, v.radius * 2);
        } else {
          // Draw circle for wash and spot
          ctx.moveTo(v.x + v.radius, v.y);
          ctx.arc(v.x, v.y, v.radius, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }

    ctx.strokeStyle = "#52525b";
    ctx.lineWidth = 1 / scale;
    for (const visual of this.fixtures.values()) {
      ctx.beginPath();
      if (visual.type === "pixel") {
        ctx.rect(
          visual.x - visual.radius,
          visual.y - visual.radius,
          visual.radius * 2,
          visual.radius * 2,
        );
      } else {
        ctx.arc(visual.x, visual.y, visual.radius, 0, Math.PI * 2);
      }
      ctx.stroke();
    }

    // Draw glow
    if (this.glowEnabled) {
      ctx.globalCompositeOperation = "lighter";
      for (const visual of this.fixtures.values()) {
        if (visual.brightness > 0.05) {
          const { r, g, b } = visual.currentColor;
          ctx.fillStyle = `rgba(${r},${g},${b},${visual.brightness * 0.4})`;
          ctx.beginPath();
          ctx.arc(visual.x, visual.y, visual.radius * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }

    ctx.restore();
  }
}
