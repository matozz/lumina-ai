import { describe, expect, it } from "vitest";
import {
  createTimelineGeometry,
  gridSnapBeats,
  pointerDeltaWithScroll,
  snappedDurationForPointerDelta,
  snappedTickForPointerDelta,
  ticksToPixels,
} from "./timelineGeometry";

describe("timeline geometry", () => {
  it.fails("keeps a half-beat snap when only zoom changes", () => {
    expect(createTimelineGeometry(960, 24).snapTicks).toBe(
      createTimelineGeometry(960, 120).snapTicks,
    );
  });

  it("derives one shared snap interval from zoom for grid, preview, and commit", () => {
    const zoomedOut = createTimelineGeometry(960, 40);
    const zoomedIn = createTimelineGeometry(960, 80);

    expect(gridSnapBeats(zoomedOut.beatWidth)).toBe(1);
    expect(snappedTickForPointerDelta(960, 21, zoomedOut)).toBe(1_920);
    expect(ticksToPixels(1_920 - 960, zoomedOut)).toBe(40);

    expect(gridSnapBeats(zoomedIn.beatWidth)).toBe(0.5);
    expect(snappedTickForPointerDelta(960, 21, zoomedIn)).toBe(1_440);
    expect(ticksToPixels(1_440 - 960, zoomedIn)).toBe(40);
  });

  it("includes scroll movement once and snaps resize at the original right edge", () => {
    const geometry = createTimelineGeometry(960, 80);
    const deltaPixels = pointerDeltaWithScroll(300, 300, 1_000, 1_040);

    expect(deltaPixels).toBe(40);
    expect(snappedTickForPointerDelta(1_920, deltaPixels, geometry)).toBe(2_400);
    expect(snappedDurationForPointerDelta(1_920, 1_920, deltaPixels, geometry)).toBe(2_400);
  });
});
