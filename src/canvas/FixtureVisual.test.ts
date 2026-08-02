import { describe, expect, it } from "vitest";
import { FixtureVisual } from "./FixtureVisual";

describe("FixtureVisual", () => {
  it("applies each logical frame immediately without preview interpolation", () => {
    const visual = new FixtureVisual(1, 0, 0, "pixel");

    visual.applyOutput(255, 120, 40, 0.5);
    expect(visual.currentColor).toEqual({ r: 128, g: 60, b: 20 });

    visual.applyOutput(0, 255, 0, 1);
    expect(visual.currentColor).toEqual({ r: 0, g: 255, b: 0 });
  });

  it("renders blackout directly from a zero dimmer frame", () => {
    const visual = new FixtureVisual(1, 0, 0);

    visual.applyOutput(255, 255, 255, 1);
    visual.applyOutput(255, 255, 255, 0);

    expect(visual.currentColorHex).toBe("#000000");
    expect(visual.brightness).toBe(0);
  });
});
