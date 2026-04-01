import { create } from "zustand";
import type { TimelineEventDSL } from "../bridge/types";

// UI specific timeline event type that extends the DSL type with an originalIndex for tracking
export type UITimelineEvent = TimelineEventDSL & { originalIndex: number };

export interface TimelineState {
  events: UITimelineEvent[];
  selectedPhaser: string | null;
  expandedTracks: Record<string, boolean>;
}

export const useTimelineStore = create<TimelineState>()(() => ({
  events: [],
  selectedPhaser: null,
  expandedTracks: {},
}));

export const timelineActions = {
  setEvents: (events: UITimelineEvent[]) => useTimelineStore.setState({ events }),
  setSelectedPhaser: (id: string | null) => useTimelineStore.setState({ selectedPhaser: id }),
  setExpandedTracks: (expandedTracks: Record<string, boolean>) =>
    useTimelineStore.setState({ expandedTracks }),
  toggleTrackExpanded: (trackName: string) => {
    useTimelineStore.setState((state) => ({
      expandedTracks: {
        ...state.expandedTracks,
        [trackName]: !state.expandedTracks[trackName],
      },
    }));
  },
  addEvent: (event: TimelineEventDSL) => {
    // Note: We might need to rethink how to sync this back to DSL
    // For now, it will be handled by the UI component orchestrator
    useTimelineStore.setState((state) => ({
      events: [...state.events, { ...event, originalIndex: state.events.length }],
    }));
  },
  deleteEvent: (originalIndex: number) => {
    useTimelineStore.setState((state) => ({
      events: state.events.filter((e) => e.originalIndex !== originalIndex),
    }));
  },
};

export const timelineSelectors = {
  events: (state: TimelineState) => state.events,
  selectedPhaser: (state: TimelineState) => state.selectedPhaser,
  expandedTracks: (state: TimelineState) => state.expandedTracks,
};
