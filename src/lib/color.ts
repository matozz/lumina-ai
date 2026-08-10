const WHITE = [0.95047, 1, 1.08883] as const;

export function interpolateHexColorLab(left: string, right: string, progress: number) {
  const leftRgb = parseHexColor(left);
  const rightRgb = parseHexColor(right);
  if (!leftRgb || !rightRgb) return left;
  if (progress <= 0) return left.toUpperCase();
  if (progress >= 1) return right.toUpperCase();
  const leftLab = rgbToLab(leftRgb);
  const rightLab = rgbToLab(rightRgb);
  const t = Math.max(0, Math.min(1, progress));
  return formatHexColor(
    labToRgb([
      mix(leftLab[0], rightLab[0], t),
      mix(leftLab[1], rightLab[1], t),
      mix(leftLab[2], rightLab[2], t),
    ]),
  );
}

export function parseHexColor(value: string): [number, number, number] | null {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return null;
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function rgbToLab([red, green, blue]: [number, number, number]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return xyzToLab([
    r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    r * 0.2126729 + g * 0.7151522 + b * 0.072175,
    r * 0.0193339 + g * 0.119192 + b * 0.9503041,
  ]);
}

function xyzToLab(xyz: [number, number, number]): [number, number, number] {
  const [x, y, z] = xyz.map((value, index) => labPivot(value / WHITE[index])) as [
    number,
    number,
    number,
  ];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function labToRgb([lightness, a, b]: [number, number, number]): [number, number, number] {
  const y = (lightness + 16) / 116;
  const x = a / 500 + y;
  const z = y - b / 200;
  const [xValue, yValue, zValue] = [x, y, z].map(
    (value, index) => inverseLabPivot(value) * WHITE[index],
  );
  const linear = [
    xValue * 3.2404542 + yValue * -1.5371385 + zValue * -0.4985314,
    xValue * -0.969266 + yValue * 1.8760108 + zValue * 0.041556,
    xValue * 0.0556434 + yValue * -0.2040259 + zValue * 1.0572252,
  ];
  return linear.map((channel) => {
    const srgb = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
    return Math.trunc(Math.max(0, Math.min(1, srgb)) * 255);
  }) as [number, number, number];
}

function labPivot(value: number) {
  return value > 216 / 24_389 ? Math.cbrt(value) : ((24_389 / 27) * value + 16) / 116;
}

function inverseLabPivot(value: number) {
  const cubed = value ** 3;
  return cubed > 216 / 24_389 ? cubed : (116 * value - 16) / (24_389 / 27);
}

function mix(left: number, right: number, progress: number) {
  return left + (right - left) * progress;
}

function formatHexColor([red, green, blue]: [number, number, number]) {
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}
