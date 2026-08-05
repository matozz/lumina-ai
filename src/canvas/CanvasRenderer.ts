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
  private dirty: boolean = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.fixtures = new Map();
    this.camera = new Camera(canvas);
  }

  initFromLayout(coords: LayoutCoord[]): void {
    this.fixtures.clear();
    for (const { id, x, y, type, width, height, patched } of coords) {
      this.fixtures.set(id, new FixtureVisual(id, x, y, type, width, height, patched));
    }
    this.camera.fitToContent(coords);
    this.dirty = true;
  }

  applyFrame(outputs: FixtureFramePayload[], _full: boolean): void {
    for (const frame of outputs) {
      const out = toPreviewOutput(frame);
      const visual = this.fixtures.get(out.id);
      if (visual) {
        visual.applyOutput(out.r, out.g, out.b, out.dimmer);
      }
    }
    this.dirty = true;
  }

  startRenderLoop(): void {
    const loop = () => {
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.camera.fitToContent(Array.from(this.fixtures.values()));
        this.dirty = true;
      }
      if (this.dirty) {
        this.draw();
        this.dirty = false;
      }

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
          ctx.rect(v.x - v.width / 2, v.y - v.height / 2, v.width, v.height);
        } else {
          ctx.moveTo(v.x + v.width / 2, v.y);
          ctx.ellipse(v.x, v.y, v.width / 2, v.height / 2, 0, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }

    ctx.strokeStyle = "#52525b";
    ctx.lineWidth = 0.5 / scale;
    ctx.beginPath();
    for (const visual of this.fixtures.values()) {
      if (!visual.patched) continue;
      addFixturePath(ctx, visual);
    }
    ctx.stroke();

    ctx.strokeStyle = "#3f3f46";
    ctx.setLineDash([2 / scale, 2 / scale]);
    ctx.beginPath();
    for (const visual of this.fixtures.values()) {
      if (visual.patched) continue;
      addFixturePath(ctx, visual);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw glow
    if (this.glowEnabled && this.fixtures.size <= 400) {
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

function addFixturePath(ctx: CanvasRenderingContext2D, visual: FixtureVisual) {
  if (visual.type === "pixel") {
    ctx.rect(
      visual.x - visual.width / 2,
      visual.y - visual.height / 2,
      visual.width,
      visual.height,
    );
  } else {
    ctx.moveTo(visual.x + visual.width / 2, visual.y);
    ctx.ellipse(visual.x, visual.y, visual.width / 2, visual.height / 2, 0, 0, Math.PI * 2);
  }
}
