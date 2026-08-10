import { describe, expect, it } from "vitest";
import {
  createTimelineGeometry,
  pointerDeltaWithScroll,
  snapTicksForPreset,
  visualGridTicks,
  snappedDurationForPointerDelta,
  snappedTickForPointerDelta,
} from "./timelineGeometry";

describe("timeline geometry", () => {
  it("keeps a half-beat snap when only zoom changes", () => {
    expect(createTimelineGeometry(960, 24).snapTicks).toBe(
      createTimelineGeometry(960, 120).snapTicks,
    );
  });

  it("uses the explicit snap interval for preview and commit at every zoom", () => {
    const zoomedOut = createTimelineGeometry(960, 4, 240);
    const zoomedIn = createTimelineGeometry(960, 120, 240);

    expect(snappedTickForPointerDelta(960, 1.1, zoomedOut)).toBe(1_200);
    expect(snappedTickForPointerDelta(960, 30, zoomedIn)).toBe(1_200);
    expect(zoomedOut.snapTicks).toBe(zoomedIn.snapTicks);
  });

  it("converts every snap preset to integer PPQ ticks", () => {
    expect(snapTicksForPreset(960, "bar")).toBe(3_840);
    expect(snapTicksForPreset(960, "beat")).toBe(960);
    expect(snapTicksForPreset(960, "half")).toBe(480);
    expect(snapTicksForPreset(960, "quarter")).toBe(240);
    expect(snapTicksForPreset(960, "eighth")).toBe(120);
    expect(snapTicksForPreset(960, "bar", { numerator: 3, denominator: 4 })).toBe(2_880);
  });

  it("changes visual grid density without changing Snap", () => {
    const snapTicks = 480;
    expect(visualGridTicks(960, 24)).toBe(960);
    expect(visualGridTicks(960, 120)).toBe(240);
    expect(createTimelineGeometry(960, 24, snapTicks).snapTicks).toBe(snapTicks);
    expect(createTimelineGeometry(960, 120, snapTicks).snapTicks).toBe(snapTicks);
  });

  it("includes scroll movement once and snaps resize at the original right edge", () => {
    const geometry = createTimelineGeometry(960, 80);
    const deltaPixels = pointerDeltaWithScroll(300, 300, 1_000, 1_040);

    expect(deltaPixels).toBe(40);
    expect(snappedTickForPointerDelta(1_920, deltaPixels, geometry)).toBe(2_400);
    expect(snappedDurationForPointerDelta(1_920, 1_920, deltaPixels, geometry)).toBe(2_400);
  });
});
