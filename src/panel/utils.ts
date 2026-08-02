import type { TimelineTrackData } from "./types";

export function calculateTimelineDimensions(
  tracks: TimelineTrackData[],
  globalBeat: number,
  beatWidth: number,
) {
  let maxBeatFromEvents = 0;
  for (const track of tracks) {
    for (const event of track.events) {
      maxBeatFromEvents = Math.max(maxBeatFromEvents, event.beat + (event.duration ?? 4));
    }
    for (const subTrack of track.subTracks ?? []) {
      for (const event of subTrack.events) {
        maxBeatFromEvents = Math.max(maxBeatFromEvents, event.beat + (event.duration ?? 4));
      }
    }
  }

  const maxBeat = Math.max(32, maxBeatFromEvents, globalBeat + 8);
  const totalBeats = Math.ceil(maxBeat / 4) * 4 + 4;
  const scrollWidth = totalBeats * beatWidth;
  const playheadX = globalBeat * beatWidth;

  return { maxBeat, totalBeats, scrollWidth, playheadX };
}
