import { describe, expect, it } from "vitest";
import type { KeyframeDSL } from "@/bridge/types";
import {
  clampKeyframeDelta,
  clampKeyframeDeltaToSnap,
  keyframeMoveBounds,
  keyframeValueY,
} from "./keyframeGeometry";

const keyframes: KeyframeDSL[] = [0, 480, 960, 1_440].map((time_tick, index) => ({
  id: `key-${index}`,
  time_tick,
  value: { type: "scalar", value: index / 3 },
  interpolation: "linear",
}));

describe("keyframe geometry", () => {
  it("bounds non-contiguous multi-selection without crossing unselected keys", () => {
    const bounds = keyframeMoveBounds(keyframes, new Set(["key-1", "key-3"]));
    expect(bounds).toEqual({ minimum: -479, maximum: 479 });
    expect(clampKeyframeDelta(-960, bounds)).toBe(-479);
  });

  it("clamps a dragged point to the nearest legal Snap instead of a one-tick boundary", () => {
    expect(clampKeyframeDeltaToSnap(960, { minimum: -960, maximum: 959 }, 960, 240)).toBe(720);
    expect(clampKeyframeDeltaToSnap(-960, { minimum: -960, maximum: 959 }, 960, 240)).toBe(-960);
    expect(clampKeyframeDeltaToSnap(480, { minimum: -479, maximum: 479 }, 480, 480)).toBe(0);
  });

  it("maps scalar ranges vertically", () => {
    expect(
      keyframeValueY(
        { type: "scalar", value: 50 },
        {
          id: "width",
          name: "Width",
          schema: {
            type: "scalar",
            default: 0,
            range: { min: 0, max: 100, step: 1 },
            unit: "percent",
          },
          scope: "arrangement",
          section: "main",
          help: "Effect width.",
        },
        32,
      ),
    ).toBe(16);
  });
});
