import type { TimelineEventDSL } from "@/bridge/types";
import type { TimelineTrackData } from "./types";
import { BEAT_WIDTH } from "./context/TimelineContext";
import { automationTargetPath } from "@/document/automationTarget";

export function resolveOverlaps(events: TimelineEventDSL[]): TimelineEventDSL[] {
  const tracks = new Map<string, TimelineEventDSL[]>();

  events.forEach((e) => {
    let groupKey = "global";

    if (e.action.type === "phaser") {
      groupKey = `phaser:${e.action.phaser}`;
    } else if (e.action.type === "animate") {
      groupKey = `animate:${automationTargetPath(e.action.target)}`;
    }

    if (!tracks.has(groupKey)) tracks.set(groupKey, []);
    tracks.get(groupKey)?.push(e);
  });

  const resolvedEvents: TimelineEventDSL[] = [];

  tracks.forEach((trackEvents) => {
    trackEvents.sort((a, b) => a.beat - b.beat);

    for (let i = 0; i < trackEvents.length; i++) {
      const current = trackEvents[i];

      if (i < trackEvents.length - 1) {
        const next = trackEvents[i + 1];
        const currentEnd = current.beat + (current.duration || 4);

        if (currentEnd > next.beat) {
          current.duration = Math.max(0.5, next.beat - current.beat);
        }
      }
      resolvedEvents.push(current);
    }
  });

  return resolvedEvents.sort((a, b) => a.beat - b.beat);
}

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
