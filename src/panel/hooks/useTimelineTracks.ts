import { useMemo } from "react";
import type { TimelineEventDSL } from "@/bridge/types";
import type { UITimelineEvent, TimelineTrackData } from "../types";
import { automationTargetParentTrack } from "@/document/automationTarget";

export const useTimelineTracks = (timelineEvents: TimelineEventDSL[]): TimelineTrackData[] => {
  return useMemo(() => {
    const trackMap = new Map<string, UITimelineEvent[]>();
    const animationsMap = new Map<string, UITimelineEvent[]>();

    timelineEvents.forEach((event, index) => {
      if (event.action.type === "animate") {
        const parentTrackId = automationTargetParentTrack(event.action.target);
        const timelineEvent: UITimelineEvent = {
          ...event,
          id: `timeline-anim-${event.id ?? index}`,
          originalIndex: index,
          duration: event.duration ?? 4,
        };
        const animations = animationsMap.get(parentTrackId) ?? [];
        animations.push(timelineEvent);
        animationsMap.set(parentTrackId, animations);
        return;
      }

      const trackId = `phaser:${event.action.instance_id}`;
      const timelineEvent: UITimelineEvent = {
        ...event,
        id: `timeline-${event.id ?? index}`,
        originalIndex: index,
        duration: event.duration ?? 4,
      };
      const events = trackMap.get(trackId) ?? [];
      events.push(timelineEvent);
      trackMap.set(trackId, events);
    });

    const trackIds = new Set([...trackMap.keys(), ...animationsMap.keys()]);
    if (trackIds.size === 0) trackIds.add("global");

    return Array.from(trackIds)
      .map((trackId): TimelineTrackData => {
        const subTracks = new Map<string, UITimelineEvent[]>();
        for (const event of animationsMap.get(trackId) ?? []) {
          if (event.action.type !== "animate") continue;
          const parameterId = event.action.target.parameter_id;
          const events = subTracks.get(parameterId) ?? [];
          events.push(event);
          subTracks.set(parameterId, events);
        }
        return {
          id: trackId,
          name: trackId,
          events: trackMap.get(trackId) ?? [],
          subTracks: Array.from(subTracks, ([name, events]) => ({ name, events })).sort(
            (left, right) => left.name.localeCompare(right.name),
          ),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [timelineEvents]);
};
