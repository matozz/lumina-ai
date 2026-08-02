export class FixtureVisual {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly type: string;
  readonly radius: number;

  currentColor: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 };

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

  applyOutput(r: number, g: number, b: number, dimmer: number): void {
    this.currentColor = {
      r: Math.round(r * dimmer),
      g: Math.round(g * dimmer),
      b: Math.round(b * dimmer),
    };
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
