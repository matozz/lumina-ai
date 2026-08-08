import { describe, expect, it } from "vitest";
import type { FixtureFramePayload } from "../bridge/types";
import { toPreviewOutput } from "./previewFrame";

describe("fixture frame preview adapter", () => {
  it("projects generic attributes without depending on profile order", () => {
    const frame: FixtureFramePayload = {
      id: 7,
      profile_id: "generic-moving-head",
      attributes: [
        { id: "position.tilt", value: { type: "angle", value: -45 } },
        { id: "color.rgb", value: { type: "color", value: [12, 34, 56] } },
        { id: "beam.gobo", value: { type: "enum", value: "dots" } },
        { id: "intensity", value: { type: "scalar", value: 0.75 } },
        { id: "position.pan", value: { type: "angle", value: 90 } },
      ],
    };

    expect(toPreviewOutput(frame)).toEqual({
      id: 7,
      r: 12,
      g: 34,
      b: 56,
      dimmer: 0.75,
      pan: 90,
      tilt: -45,
    });
  });

  it("uses safe preview defaults and never mutates the source frame", () => {
    const frame: FixtureFramePayload = {
      id: 1,
      profile_id: "custom",
      attributes: [{ id: "intensity", value: { type: "scalar", value: 2 } }],
    };
    const snapshot = structuredClone(frame);

    expect(toPreviewOutput(frame)).toEqual({
      id: 1,
      r: 0,
      g: 0,
      b: 0,
      dimmer: 1,
    });
    expect(frame).toEqual(snapshot);
  });

  it("can visualize intensity-only authoring output without changing engine data", () => {
    const frame: FixtureFramePayload = {
      id: 3,
      profile_id: "generic-rgb",
      attributes: [
        { id: "intensity", value: { type: "scalar", value: 0.5 } },
        { id: "color.rgb", value: { type: "color", value: [0, 0, 0] } },
      ],
    };

    expect(toPreviewOutput(frame, [139, 119, 255])).toMatchObject({
      r: 139,
      g: 119,
      b: 255,
      dimmer: 0.5,
    });
    expect(frame.attributes[1]).toEqual({
      id: "color.rgb",
      value: { type: "color", value: [0, 0, 0] },
    });
  });
});
