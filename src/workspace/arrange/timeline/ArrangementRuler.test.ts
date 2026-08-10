import { describe, expect, it } from "vitest";
import { createTimelineGeometry } from "@/panel/timelineGeometry";
import { arrangementGridDensity } from "./ArrangementRuler";

describe("Arrangement ruler density", () => {
  it("reduces visual marks independently from the editing snap", () => {
    const global = createTimelineGeometry(960, 3, 480);
    const detail = createTimelineGeometry(960, 48, 480);

    expect(arrangementGridDensity(global.beatWidth)).toMatchObject({
      barStride: 8,
      showBeatGrid: false,
    });
    expect(arrangementGridDensity(detail.beatWidth)).toMatchObject({
      barStride: 1,
      showBeatGrid: true,
    });
    expect(global.snapTicks).toBe(detail.snapTicks);
  });
});
