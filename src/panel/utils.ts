import type { TimelineTrackData } from "./types";
import { BEAT_WIDTH } from "./context/TimelineContext";

export function calculateTimelineDimensions(tracks: TimelineTrackData[], globalBeat: number) {
  const maxBeatFromEvents =
    tracks.flatMap((t) => t.events).length > 0
      ? Math.max(...tracks.flatMap((t) => t.events).map((e) => e.beat + (e.duration || 4)))
      : 0;

  const maxBeat = Math.max(32, maxBeatFromEvents, globalBeat + 8);
  const totalBeats = Math.ceil(maxBeat / 4) * 4 + 4;
  const scrollWidth = totalBeats * BEAT_WIDTH;
  const playheadX = globalBeat * BEAT_WIDTH;

  return { maxBeat, totalBeats, scrollWidth, playheadX };
}
