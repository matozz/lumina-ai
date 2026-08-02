import type { EffectClipDSL, FullDSL, TimelineTrackDSL } from "@/bridge/types";

export interface ClipTrimPreview {
  durationTick: number;
  sourceOffsetTick: number;
  startTick: number;
}

export interface ClipOverlapPlan {
  clip: EffectClipDSL;
  overlappingClipIds: string[];
  track: TimelineTrackDSL;
  trim: ClipTrimPreview | null;
}

export function clipOverlapPlan(
  document: FullDSL | null,
  trackId: string,
  clipId: string,
): ClipOverlapPlan | null {
  const track = document?.timeline?.tracks.find((candidate) => candidate.id === trackId);
  const clip = track?.clips?.find((candidate) => candidate.id === clipId);
  if (!track || !clip) return null;
  const clipEnd = clip.start_tick + clip.duration_tick;
  const overlaps = (track.clips ?? [])
    .filter(
      (candidate) =>
        candidate.id !== clip.id &&
        candidate.start_tick < clipEnd &&
        clip.start_tick < candidate.start_tick + candidate.duration_tick,
    )
    .sort((left, right) => left.start_tick - right.start_tick || left.id.localeCompare(right.id));
  const occupied = mergeIntervals(
    overlaps.map((candidate) => [
      Math.max(clip.start_tick, candidate.start_tick),
      Math.min(clipEnd, candidate.start_tick + candidate.duration_tick),
    ]),
  );
  const available = availableIntervals(clip.start_tick, clipEnd, occupied).sort(
    (left, right) => right[1] - right[0] - (left[1] - left[0]) || left[0] - right[0],
  )[0];

  return {
    clip,
    overlappingClipIds: overlaps.map((candidate) => candidate.id),
    track,
    trim: available
      ? {
          startTick: available[0],
          durationTick: available[1] - available[0],
          sourceOffsetTick: (clip.source_offset_tick ?? 0) + available[0] - clip.start_tick,
        }
      : null,
  };
}

function mergeIntervals(intervals: number[][]): number[][] {
  const merged: number[][] = [];
  for (const interval of intervals.sort((left, right) => left[0] - right[0])) {
    const previous = merged[merged.length - 1];
    if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}

function availableIntervals(start: number, end: number, occupied: number[][]): number[][] {
  const available: number[][] = [];
  let cursor = start;
  for (const interval of occupied) {
    if (interval[0] > cursor) available.push([cursor, interval[0]]);
    cursor = Math.max(cursor, interval[1]);
  }
  if (cursor < end) available.push([cursor, end]);
  return available;
}
