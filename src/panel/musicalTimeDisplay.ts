import type { TempoMapDSL } from "@/bridge/types";

export function formatMusicalPosition(timeTick: number, ppq: number): string {
  const ticksPerBar = ppq * 4;
  const bar = Math.floor(timeTick / ticksPerBar) + 1;
  const withinBar = timeTick % ticksPerBar;
  const beat = Math.floor(withinBar / ppq) + 1;
  const tick = withinBar % ppq;
  return `${bar}.${beat}.${String(tick).padStart(3, "0")}`;
}

export function ticksToSeconds(timeTick: number, ppq: number, tempoMap: TempoMapDSL): number {
  const points = tempoMap.points;
  let seconds = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (timeTick <= point.time_tick) break;
    const segmentEnd = Math.min(timeTick, points[index + 1]?.time_tick ?? timeTick);
    if (segmentEnd > point.time_tick) {
      seconds += ((segmentEnd - point.time_tick) / ppq) * (60 / point.bpm);
    }
    if (segmentEnd === timeTick) break;
  }
  return seconds;
}

export function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
}
