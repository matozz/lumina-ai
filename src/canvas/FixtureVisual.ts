export class FixtureVisual {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly type: string;
  readonly width: number;
  readonly height: number;
  readonly patched: boolean;
  readonly radius: number;

  currentColor: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 };

  constructor(
    id: number,
    x: number,
    y: number,
    type: string = "spot",
    width?: number,
    height?: number,
    patched: boolean = true,
  ) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.type = type;

    const defaultDiameter = this.type === "pixel" ? 8 : 16;
    this.width = width ?? defaultDiameter;
    this.height = height ?? defaultDiameter;
    this.patched = patched;
    this.radius = Math.max(this.width, this.height) / 2;
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
