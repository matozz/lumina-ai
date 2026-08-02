import type { UITimelineEvent } from "./types";

export interface TimelineViewport {
  startBeat: number;
  endBeat: number;
  visibleStartBeat?: number;
  visibleEndBeat?: number;
}

export const VIEWPORT_OVERSCAN_BEATS = 8;

export function viewportFromScroll(
  scrollLeft: number,
  clientWidth: number,
  beatWidth: number,
): TimelineViewport {
  return {
    startBeat: Math.floor(Math.max(0, scrollLeft / beatWidth - VIEWPORT_OVERSCAN_BEATS)),
    endBeat: Math.ceil((scrollLeft + clientWidth) / beatWidth + VIEWPORT_OVERSCAN_BEATS),
    visibleStartBeat: Math.floor(scrollLeft / beatWidth),
    visibleEndBeat: Math.ceil((scrollLeft + clientWidth) / beatWidth),
  };
}

export function visibleTimelineEvents(
  events: UITimelineEvent[],
  viewport: TimelineViewport,
): UITimelineEvent[] {
  return events.filter((event) => {
    const duration = event.duration ?? 4;
    return event.beat + duration >= viewport.startBeat && event.beat <= viewport.endBeat;
  });
}
