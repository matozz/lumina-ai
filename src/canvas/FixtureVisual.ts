export class FixtureVisual {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly type: string;
  readonly radius: number;

  currentColor: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 };
  private targetColor: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 };
  private fromColor: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 };
  private progress: number = 1; // [0, 1]
  private duration: number = 80; // ms

  constructor(id: number, x: number, y: number, type: string = "spot") {
    this.id = id;
    this.x = x;
    this.y = y;
    this.type = type;

    // Determine size based on fixture type
    if (this.type === "pixel") {
      this.radius = 4;
    } else {
      // spot and default
      this.radius = 8;
    }
  }

  setTarget(r: number, g: number, b: number, dimmer: number): void {
    const dr = Math.round(r * dimmer);
    const dg = Math.round(g * dimmer);
    const db = Math.round(b * dimmer);

    if (this.targetColor.r === dr && this.targetColor.g === dg && this.targetColor.b === db) {
      return;
    }

    this.fromColor = { ...this.currentColor };
    this.targetColor = { r: dr, g: dg, b: db };
    this.progress = 0;
  }

  updateInterpolation(dt: number): void {
    if (this.progress >= 1) return;

    this.progress = Math.min(1, this.progress + dt / this.duration);
    const t = 1 - Math.pow(1 - this.progress, 3);

    this.currentColor.r = Math.round(
      this.fromColor.r + (this.targetColor.r - this.fromColor.r) * t,
    );
    this.currentColor.g = Math.round(
      this.fromColor.g + (this.targetColor.g - this.fromColor.g) * t,
    );
    this.currentColor.b = Math.round(
      this.fromColor.b + (this.targetColor.b - this.fromColor.b) * t,
    );
  }

  get currentColorHex(): string {
    const { r, g, b } = this.currentColor;
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  get brightness(): number {
    const { r, g, b } = this.currentColor;
    return (r + g + b) / (255 * 3);
  }
}
