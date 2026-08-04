import type { TempoMapDSL, TimeSignaturePoint } from "@/bridge/types";

export interface AuthoringClockDefinition {
  ppq: number;
  tempoMap: TempoMapDSL;
  timeSignatures: TimeSignaturePoint[];
  durationTicks: number;
}

export interface LocalPreviewTiming {
  bpm: number;
  numerator: number;
  denominator: number;
  loopBars: number;
}

export interface MusicalPosition {
  bar: number;
  beat: number;
  tick: number;
  numerator: number;
  denominator: number;
  beatTicks: number;
  barTicks: number;
}

export interface RulerMark extends MusicalPosition {
  timeTick: number;
  isBar: boolean;
}

interface MeterSegment {
  startTick: number;
  endTick: number;
  startBar: number;
  numerator: number;
  denominator: number;
  beatTicks: number;
  barTicks: number;
}

const MICROSECONDS_PER_MINUTE = 60_000_000;

export function createLocalPreviewClock(
  timing: LocalPreviewTiming,
  ppq = 960,
): AuthoringClockDefinition {
  const beatTicks = ticksPerBeat(ppq, timing.denominator);
  return {
    ppq,
    tempoMap: { points: [{ time_tick: 0, bpm: timing.bpm }] },
    timeSignatures: [
      {
        time_tick: 0,
        numerator: timing.numerator,
        denominator: timing.denominator,
      },
    ],
    durationTicks: beatTicks * timing.numerator * timing.loopBars,
  };
}

export function currentBpm(tempoMap: TempoMapDSL, tick: number): number {
  const points = tempoMap.points;
  let current = points[0]?.bpm ?? 120;
  for (const point of points) {
    if (point.time_tick > tick) break;
    current = point.bpm;
  }
  return current;
}

export function tickToMicroseconds(tick: number, ppq: number, tempoMap: TempoMapDSL): number {
  const targetTick = Math.max(0, tick);
  const points = tempoMap.points;
  let elapsed = 0;
  let segmentTick = 0;
  let bpm = points[0]?.bpm ?? 120;

  for (let index = 1; index < points.length; index += 1) {
    const next = points[index];
    if (next.time_tick >= targetTick) break;
    elapsed += ticksToMicroseconds(next.time_tick - segmentTick, ppq, bpm);
    segmentTick = next.time_tick;
    bpm = next.bpm;
  }

  return elapsed + ticksToMicroseconds(targetTick - segmentTick, ppq, bpm);
}

export function microsecondsToTick(
  microseconds: number,
  ppq: number,
  tempoMap: TempoMapDSL,
): number {
  let remaining = Math.max(0, microseconds);
  const points = tempoMap.points;
  let segmentTick = 0;
  let bpm = points[0]?.bpm ?? 120;

  for (let index = 1; index < points.length; index += 1) {
    const next = points[index];
    const segmentDuration = ticksToMicroseconds(next.time_tick - segmentTick, ppq, bpm);
    if (remaining < segmentDuration) break;
    remaining -= segmentDuration;
    segmentTick = next.time_tick;
    bpm = next.bpm;
  }

  return segmentTick + microsecondsToTicks(remaining, ppq, bpm);
}

export function advanceClockTick(
  anchorTick: number,
  elapsedMilliseconds: number,
  clock: AuthoringClockDefinition,
  loop?: { enabled: boolean; startTick: number; endTick: number },
): { tick: number; ended: boolean } {
  const elapsedMicroseconds = Math.max(0, elapsedMilliseconds) * 1_000;
  const durationTicks = Math.max(1, clock.durationTicks);
  const durationMicroseconds = tickToMicroseconds(durationTicks, clock.ppq, clock.tempoMap);
  let targetMicroseconds =
    tickToMicroseconds(
      Math.max(0, Math.min(anchorTick, durationTicks)),
      clock.ppq,
      clock.tempoMap,
    ) + elapsedMicroseconds;

  if (loop?.enabled) {
    const startTick = Math.max(0, Math.min(loop.startTick, durationTicks - 1));
    const endTick = Math.max(startTick + 1, Math.min(loop.endTick, durationTicks));
    const startMicroseconds = tickToMicroseconds(startTick, clock.ppq, clock.tempoMap);
    const endMicroseconds = tickToMicroseconds(endTick, clock.ppq, clock.tempoMap);
    const loopDuration = endMicroseconds - startMicroseconds;
    if (targetMicroseconds >= endMicroseconds && loopDuration > 0) {
      targetMicroseconds =
        startMicroseconds + ((targetMicroseconds - endMicroseconds) % loopDuration);
    }
    return {
      tick: Math.min(
        endTick - 1,
        Math.floor(microsecondsToTick(targetMicroseconds, clock.ppq, clock.tempoMap)),
      ),
      ended: false,
    };
  }

  if (targetMicroseconds >= durationMicroseconds) {
    return { tick: durationTicks, ended: true };
  }
  return {
    tick: Math.floor(microsecondsToTick(targetMicroseconds, clock.ppq, clock.tempoMap)),
    ended: false,
  };
}

export function musicalPositionAtTick(
  tick: number,
  ppq: number,
  timeSignatures: TimeSignaturePoint[],
): MusicalPosition {
  const targetTick = Math.max(0, Math.floor(tick));
  const segments = meterSegments(ppq, timeSignatures, Number.POSITIVE_INFINITY);
  const segment =
    [...segments].reverse().find((candidate) => candidate.startTick <= targetTick) ?? segments[0];
  const offset = targetTick - segment.startTick;
  const barOffset = Math.floor(offset / segment.barTicks);
  const tickInBar = offset - barOffset * segment.barTicks;
  const beatOffset = Math.floor(tickInBar / segment.beatTicks);
  return {
    bar: segment.startBar + barOffset,
    beat: beatOffset + 1,
    tick: tickInBar - beatOffset * segment.beatTicks,
    numerator: segment.numerator,
    denominator: segment.denominator,
    beatTicks: segment.beatTicks,
    barTicks: segment.barTicks,
  };
}

export function formatMusicalPosition(position: Pick<MusicalPosition, "bar" | "beat" | "tick">) {
  return `${position.bar}.${position.beat}.${position.tick}`;
}

export function rulerMarks(
  ppq: number,
  timeSignatures: TimeSignaturePoint[],
  startTick: number,
  endTick: number,
): RulerMark[] {
  const viewportStart = Math.max(0, Math.floor(startTick));
  const viewportEnd = Math.max(viewportStart, Math.ceil(endTick));
  const marks: RulerMark[] = [];

  for (const segment of meterSegments(ppq, timeSignatures, viewportEnd)) {
    const rangeStart = Math.max(viewportStart, segment.startTick);
    const rangeEnd = Math.min(viewportEnd, segment.endTick);
    let markTick =
      segment.startTick +
      Math.ceil((rangeStart - segment.startTick) / segment.beatTicks) * segment.beatTicks;
    while (markTick <= rangeEnd) {
      const position = musicalPositionAtTick(markTick, ppq, timeSignatures);
      marks.push({ ...position, timeTick: markTick, isBar: position.beat === 1 });
      markTick += segment.beatTicks;
    }
  }

  return marks.filter((mark, index) => index === 0 || mark.timeTick !== marks[index - 1]?.timeTick);
}

export function ticksPerBeat(ppq: number, denominator: number): number {
  return Math.max(1, Math.round((ppq * 4) / denominator));
}

function meterSegments(
  ppq: number,
  timeSignatures: TimeSignaturePoint[],
  finalTick: number,
): MeterSegment[] {
  const points =
    timeSignatures.length > 0 ? timeSignatures : [{ time_tick: 0, numerator: 4, denominator: 4 }];
  const segments: MeterSegment[] = [];
  let startBar = 1;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const nextTick = points[index + 1]?.time_tick ?? finalTick;
    const beatTicks = ticksPerBeat(ppq, point.denominator);
    const barTicks = beatTicks * point.numerator;
    segments.push({
      startTick: point.time_tick,
      endTick: nextTick,
      startBar,
      numerator: point.numerator,
      denominator: point.denominator,
      beatTicks,
      barTicks,
    });
    if (Number.isFinite(nextTick)) {
      startBar += Math.ceil((nextTick - point.time_tick) / barTicks);
    }
  }

  return segments;
}

function ticksToMicroseconds(ticks: number, ppq: number, bpm: number) {
  return (ticks * MICROSECONDS_PER_MINUTE) / (ppq * bpm);
}

function microsecondsToTicks(microseconds: number, ppq: number, bpm: number) {
  return (microseconds * ppq * bpm) / MICROSECONDS_PER_MINUTE;
}
