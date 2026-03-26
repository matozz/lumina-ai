import type { LayoutCoord, FixtureOutput } from "../bridge/types";
import { Camera } from "./Camera";
import { FixtureVisual } from "./FixtureVisual";

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fixtures: Map<number, FixtureVisual>;
  private glowEnabled: boolean = true;
  private camera: Camera;
  private lastTimestamp: number = 0;
  private animationFrameId: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.fixtures = new Map();
    this.camera = new Camera(canvas);
  }

  initFromLayout(coords: LayoutCoord[]): void {
    this.fixtures.clear();
    for (const { id, x, y } of coords) {
      this.fixtures.set(id, new FixtureVisual(id, x, y));
    }
    this.camera.fitToContent(coords);
  }

  applyFrame(outputs: FixtureOutput[], _full: boolean): void {
    for (const out of outputs) {
      const visual = this.fixtures.get(out.id);
      if (visual) {
        visual.setTarget(out.r, out.g, out.b, out.dimmer);
      }
    }
  }

  startRenderLoop(): void {
    const loop = (timestamp: number) => {
      const dt = timestamp - this.lastTimestamp;
      this.lastTimestamp = timestamp;

      this.update(dt);
      this.draw();

      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  stopRenderLoop(): void {
    cancelAnimationFrame(this.animationFrameId);
  }

  private update(dt: number): void {
    for (const visual of this.fixtures.values()) {
      visual.updateInterpolation(dt);
    }
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
        ctx.moveTo(v.x + v.radius, v.y);
        ctx.arc(v.x, v.y, v.radius, 0, Math.PI * 2);
      }
      ctx.fill();
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
