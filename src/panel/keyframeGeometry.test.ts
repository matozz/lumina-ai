import { describe, expect, it } from "vitest";
import type { KeyframeDSL } from "@/bridge/types";
import { clampKeyframeDelta, keyframeMoveBounds, keyframeValueY } from "./keyframeGeometry";

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

  it("maps scalar ranges vertically", () => {
    expect(
      keyframeValueY(
        { type: "scalar", value: 50 },
        {
          id: "width",
          name: "Width",
          value_type: "scalar",
          default_value: { type: "scalar", value: 0 },
          range: [0, 100],
          unit: "percent",
          ui_hint: "slider",
          automation: "continuous",
        },
        32,
      ),
    ).toBe(16);
  });
});
