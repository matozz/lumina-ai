export const DEFAULT_BEAT_WIDTH = 40;
export const MIN_BEAT_WIDTH = 24;
export const MAX_BEAT_WIDTH = 120;
export const BEAT_WIDTH_STEP = 16;

export interface TimelineGeometry {
  beatWidth: number;
  ppq: number;
  snapTicks: number;
}

export function createTimelineGeometry(ppq: number, beatWidth: number): TimelineGeometry {
  return {
    beatWidth,
    ppq,
    snapTicks: Math.max(1, Math.round(ppq * gridSnapBeats(beatWidth))),
  };
}

export function gridSnapBeats(beatWidth: number): number {
  if (beatWidth >= 96) return 0.25;
  if (beatWidth >= 48) return 0.5;
  return 1;
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

export function clampBeatWidth(beatWidth: number): number {
  return Math.max(MIN_BEAT_WIDTH, Math.min(MAX_BEAT_WIDTH, beatWidth));
}
