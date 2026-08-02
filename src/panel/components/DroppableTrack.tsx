import { memo, useMemo } from "react";
import { DraggableBlock } from "./DraggableBlock";
import { cn } from "@/lib/utils";
import type { TimelineTrackData } from "../types";
import { useTimelineActions } from "../context/TimelineContext";
import { visibleTimelineEvents, type TimelineViewport } from "../virtualization";
import { AutomationLaneBlock } from "./AutomationLaneBlock";

interface TrackProps {
  track: TimelineTrackData;
  isExpanded?: boolean;
  selectedPhaser: string | null;
  viewport: TimelineViewport;
  beatWidth: number;
}

export const DroppableTrack = memo((props: TrackProps) => {
  const { track, isExpanded, selectedPhaser, viewport, beatWidth } = props;

  const actions = useTimelineActions();
  const visibleEvents = useMemo(
    () => visibleTimelineEvents(track.events, viewport),
    [track.events, viewport],
  );

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "group relative box-border h-10 border-b border-zinc-800/30 transition-colors hover:bg-zinc-900/30",
          selectedPhaser && "cursor-crosshair",
        )}
        onClick={(e) => actions.onGridClick(e, track.id)}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("application/x-lumina-effect-instance")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => actions.onDropEffect(event, track.id)}
        data-track-name={track.id}
      >
        {selectedPhaser && (
          <div className="pointer-events-none absolute inset-0 bg-indigo-500 opacity-0 transition-opacity group-hover:opacity-10" />
        )}

        {visibleEvents.map((e) => (
          <DraggableBlock key={e.id} event={e} beatWidth={beatWidth} label={track.name} />
        ))}
      </div>

      {isExpanded &&
        track.subTracks &&
        track.subTracks.map((st) => (
          <div
            key={`${track.name}-${st.name}`}
            className={cn(
              "group relative box-border h-8 border-b border-zinc-800/20 bg-black/20 transition-colors",
            )}
          >
            {visibleTimelineEvents(st.events, viewport).map((e) => (
              <AutomationLaneBlock key={e.id} event={e} viewport={viewport} />
            ))}
          </div>
        ))}
    </div>
  );
});

DroppableTrack.displayName = "DroppableTrack";
