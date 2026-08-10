import { describe, expect, it } from "vitest";
import { interpolateHexColorLab, parseHexColor } from "./color";

describe("typed color", () => {
  it("parses strict #RRGGBB and preserves interpolation endpoints", () => {
    expect(parseHexColor("#00aAfF")).toEqual([0, 170, 255]);
    expect(parseHexColor("red")).toBeNull();
    expect(interpolateHexColorLab("#FF0000", "#0000FF", 0)).toBe("#FF0000");
    expect(interpolateHexColorLab("#FF0000", "#0000FF", 1)).toBe("#0000FF");
  });

  it("interpolates through Lab instead of an RGB midpoint", () => {
    const midpoint = interpolateHexColorLab("#FF0000", "#0000FF", 0.5);
    expect(midpoint).not.toBe("#800080");
    expect(midpoint).toMatch(/^#[0-9A-F]{6}$/);
  });
});
