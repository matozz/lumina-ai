import type { TimelineEventDSL } from "../bridge/types";

export interface UITimelineEvent extends TimelineEventDSL {
  id: string;
  originalIndex: number;
}

export interface TimelineTrack {
  name: string;
  events: UITimelineEvent[];
}

export interface TimelineTrackData extends TimelineTrack {
  id: string;
  subTracks?: TimelineTrack[];
}
