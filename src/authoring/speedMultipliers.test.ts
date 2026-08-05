import { describe, expect, it } from "vitest";
import { BEAT_SYNC_SPEED_MULTIPLIERS, isBeatSyncSpeedMultiplier } from "./speedMultipliers";

describe("beat-synchronized speed multipliers", () => {
  it("accepts only the authored musical ratios", () => {
    expect(BEAT_SYNC_SPEED_MULTIPLIERS).toEqual([0.25, 0.5, 1, 2, 4, 8]);
    for (const multiplier of BEAT_SYNC_SPEED_MULTIPLIERS) {
      expect(isBeatSyncSpeedMultiplier(multiplier)).toBe(true);
    }
    expect(isBeatSyncSpeedMultiplier(0.375)).toBe(false);
    expect(isBeatSyncSpeedMultiplier(1.25)).toBe(false);
  });
});
