export const DEFAULT_BEAT_WIDTH = 40;
export const MIN_BEAT_WIDTH = 24;
export const MAX_BEAT_WIDTH = 120;
export const BEAT_WIDTH_STEP = 16;

export type ArrangementSnapPreset = "bar" | "beat" | "half" | "quarter" | "eighth";

export interface TimelineGeometry {
  beatWidth: number;
  ppq: number;
  snapTicks: number;
}

export function createTimelineGeometry(
  ppq: number,
  beatWidth: number,
  snapTicks = Math.max(1, Math.round(ppq / 2)),
): TimelineGeometry {
  return {
    beatWidth,
    ppq,
    snapTicks: Math.max(1, Math.round(snapTicks)),
  };
}

export function snapTicksForPreset(
  ppq: number,
  preset: ArrangementSnapPreset,
  timeSignature = { numerator: 4, denominator: 4 },
): number {
  const beatTicks = (ppq * 4) / timeSignature.denominator;
  if (preset === "bar") return Math.max(1, Math.round(beatTicks * timeSignature.numerator));
  if (preset === "beat") return Math.max(1, Math.round(beatTicks));
  if (preset === "half") return Math.max(1, Math.round(beatTicks / 2));
  if (preset === "quarter") return Math.max(1, Math.round(beatTicks / 4));
  return Math.max(1, Math.round(beatTicks / 8));
}

export function visualGridTicks(ppq: number, beatWidth: number): number {
  if (beatWidth >= 96) return Math.max(1, Math.round(ppq / 4));
  if (beatWidth >= 48) return Math.max(1, Math.round(ppq / 2));
  return Math.max(1, Math.round(ppq));
}

export function ticksToPixels(ticks: number, geometry: TimelineGeometry): number {
  return (ticks / geometry.ppq) * geometry.beatWidth;
}

export function pixelsToTicks(pixels: number, geometry: TimelineGeometry): number {
  return (pixels / geometry.beatWidth) * geometry.ppq;
}

export function snapTick(tick: number, geometry: TimelineGeometry): number {
  return Math.max(0, Math.round(tick / geometry.snapTicks) * geometry.snapTicks);
}

export function snappedTickForPointerDelta(
  startTick: number,
  deltaPixels: number,
  geometry: TimelineGeometry,
): number {
  return snapTick(startTick + pixelsToTicks(deltaPixels, geometry), geometry);
}

export function snappedDurationForPointerDelta(
  startTick: number,
  durationTick: number,
  deltaPixels: number,
  geometry: TimelineGeometry,
): number {
  const snappedEnd = snapTick(
    startTick + durationTick + pixelsToTicks(deltaPixels, geometry),
    geometry,
  );
  return Math.max(1, snappedEnd - startTick);
}

export function pointerDeltaWithScroll(
  startClientX: number,
  clientX: number,
  startScrollLeft: number,
  scrollLeft: number,
): number {
  return clientX - startClientX + scrollLeft - startScrollLeft;
}

export function clampBeatWidth(
  beatWidth: number,
  minimum = MIN_BEAT_WIDTH,
  maximum = MAX_BEAT_WIDTH,
): number {
  return Math.max(minimum, Math.min(maximum, beatWidth));
}
