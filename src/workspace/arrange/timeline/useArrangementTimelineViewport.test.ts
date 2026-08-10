import { describe, expect, it } from "vitest";
import { anchoredScrollLeft, fitBeatWidth } from "./useArrangementTimelineViewport";

describe("Arrangement timeline viewport", () => {
  it("fits all 64 bars inside the available viewport", () => {
    const beatWidth = fitBeatWidth(245_760, 960, 1_012);
    expect(beatWidth * (245_760 / 960)).toBeLessThanOrEqual(1_012);
    expect(beatWidth * (245_760 / 960)).toBeGreaterThanOrEqual(990);
  });

  it("allows long Arrangements to zoom below the old 24 px per beat floor", () => {
    expect(fitBeatWidth(245_760, 960, 1_012)).toBeLessThan(24);
  });

  it("keeps the anchor tick at the same viewport offset after zoom", () => {
    const nextScrollLeft = anchoredScrollLeft(96_000, 300, 960, 80);
    expect((96_000 / 960) * 80 - nextScrollLeft).toBe(300);
  });
});
