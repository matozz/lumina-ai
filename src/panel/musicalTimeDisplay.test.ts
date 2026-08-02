import { describe, expect, it } from "vitest";
import { formatMusicalPosition, formatSeconds, ticksToSeconds } from "./musicalTimeDisplay";

describe("musical time display", () => {
  it("formats one-based bar.beat.tick without changing the stored tick", () => {
    expect(formatMusicalPosition(0, 960)).toBe("1.1.000");
    expect(formatMusicalPosition(4 * 960 + 480, 960)).toBe("2.1.480");
  });

  it("converts display seconds across tempo segments", () => {
    const seconds = ticksToSeconds(2 * 960, 960, {
      points: [
        { time_tick: 0, bpm: 120 },
        { time_tick: 960, bpm: 60 },
      ],
    });
    expect(seconds).toBe(1.5);
    expect(formatSeconds(seconds)).toBe("0:01.500");
  });
});
