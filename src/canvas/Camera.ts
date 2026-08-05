type LayoutBoundsCoord = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export class Camera {
  offsetX: number = 0;
  offsetY: number = 0;
  scale: number = 1;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  fitToContent(coords: LayoutBoundsCoord[]): void {
    if (coords.length === 0) return;

    const minX = Math.min(...coords.map((coord) => coord.x - (coord.width ?? 0) / 2));
    const maxX = Math.max(...coords.map((coord) => coord.x + (coord.width ?? 0) / 2));
    const minY = Math.min(...coords.map((coord) => coord.y - (coord.height ?? 0) / 2));
    const maxY = Math.max(...coords.map((coord) => coord.y + (coord.height ?? 0) / 2));

    const contentWidth = maxX - minX + 80; // padding
    const contentHeight = maxY - minY + 80;

    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    this.scale = Math.min(
      canvasWidth / contentWidth,
      canvasHeight / contentHeight,
      2, // max zoom 2x
    );

    this.offsetX =
      (canvasWidth - contentWidth * this.scale) / 2 - minX * this.scale + 40 * this.scale;
    this.offsetY =
      (canvasHeight - contentHeight * this.scale) / 2 - minY * this.scale + 40 * this.scale;
  }
}
