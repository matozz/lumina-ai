import { describe, expect, it } from "vitest";
import {
  advanceClockTick,
  createLocalPreviewClock,
  currentBpm,
  formatMusicalPosition,
  microsecondsToTick,
  musicalPositionAtTick,
  rulerMarks,
  tickToMicroseconds,
} from "./musicalTime";

const PPQ = 960;

describe("authoring musical time", () => {
  it("derives current BPM and advances through every TempoMap segment", () => {
    const tempoMap = {
      points: [
        { time_tick: 0, bpm: 120 },
        { time_tick: 1_920, bpm: 60 },
      ],
    };
    const clock = {
      ppq: PPQ,
      tempoMap,
      timeSignatures: [{ time_tick: 0, numerator: 4, denominator: 4 }],
      durationTicks: 10_000,
    };

    expect(currentBpm(tempoMap, 1_919)).toBe(120);
    expect(currentBpm(tempoMap, 1_920)).toBe(60);
    expect(advanceClockTick(0, 1_000, clock).tick).toBe(1_920);
    expect(advanceClockTick(0, 2_000, clock).tick).toBe(2_880);
  });

  it("formats 4/4 and 3/4 positions and starts a new bar at meter changes", () => {
    const signatures = [
      { time_tick: 0, numerator: 3, denominator: 4 },
      { time_tick: 5_760, numerator: 4, denominator: 4 },
    ];

    expect(formatMusicalPosition(musicalPositionAtTick(0, PPQ, signatures), PPQ)).toBe("1.1.000");
    expect(formatMusicalPosition(musicalPositionAtTick(2_880, PPQ, signatures), PPQ)).toBe(
      "2.1.000",
    );
    expect(formatMusicalPosition(musicalPositionAtTick(5_760, PPQ, signatures), PPQ)).toBe(
      "3.1.000",
    );
    expect(musicalPositionAtTick(6_720, PPQ, signatures)).toMatchObject({
      bar: 3,
      beat: 2,
      numerator: 4,
      denominator: 4,
    });
  });

  it("counts a partial bar before an arbitrary time-signature point", () => {
    const signatures = [
      { time_tick: 0, numerator: 4, denominator: 4 },
      { time_tick: 2_000, numerator: 3, denominator: 4 },
    ];

    expect(musicalPositionAtTick(2_000, PPQ, signatures)).toMatchObject({ bar: 2, beat: 1 });
  });

  it("generates ruler beats from the active denominator instead of fixed 4/4", () => {
    const marks = rulerMarks(PPQ, [{ time_tick: 0, numerator: 3, denominator: 8 }], 0, 2_880);

    expect(marks.slice(0, 5).map((mark) => [mark.timeTick, mark.bar, mark.beat])).toEqual([
      [0, 1, 1],
      [480, 1, 2],
      [960, 1, 3],
      [1_440, 2, 1],
      [1_920, 2, 2],
    ]);
  });

  it("loops in wall-clock time across tempo changes without accumulating frame deltas", () => {
    const clock = {
      ppq: PPQ,
      tempoMap: {
        points: [
          { time_tick: 0, bpm: 120 },
          { time_tick: 1_920, bpm: 60 },
        ],
      },
      timeSignatures: [{ time_tick: 0, numerator: 4, denominator: 4 }],
      durationTicks: 3_840,
    };

    expect(
      advanceClockTick(960, 1_600, clock, {
        enabled: true,
        startTick: 960,
        endTick: 2_880,
      }).tick,
    ).toBe(1_152);
  });

  it("builds local preview duration from meter and loop bars", () => {
    const clock = createLocalPreviewClock({ bpm: 128, numerator: 3, denominator: 4, loopBars: 2 });
    expect(clock.durationTicks).toBe(5_760);
    expect(clock.tempoMap.points[0].bpm).toBe(128);
  });

  it("round-trips a thirty-minute multi-tempo cursor without frame accumulation", () => {
    const tempoMap = {
      points: [
        { time_tick: 0, bpm: 120 },
        { time_tick: 960 * 1_800, bpm: 60 },
      ],
    };
    const tick = 960 * 2_700;
    const microseconds = tickToMicroseconds(tick, PPQ, tempoMap);

    expect(microseconds).toBe(1_800_000_000);
    expect(microsecondsToTick(microseconds, PPQ, tempoMap)).toBe(tick);
  });
});
