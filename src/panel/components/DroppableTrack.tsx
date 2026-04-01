import { DraggableBlock } from "./DraggableBlock";
import { cn } from "@/lib/utils";
import type { TimelineTrackData } from "../types";
import { useTimelineActions, BEAT_WIDTH } from "../context/TimelineContext";

interface TrackProps {
  track: TimelineTrackData;
  isExpanded?: boolean;
  selectedPhaser: string | null;
}

export const DroppableTrack = (props: TrackProps) => {
  const { track, isExpanded, selectedPhaser } = props;

  const actions = useTimelineActions();

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "group relative box-border h-10 border-b border-zinc-800/30 transition-colors hover:bg-zinc-900/30",
          selectedPhaser && "cursor-crosshair",
        )}
        onClick={(e) => actions.onGridClick(e, track.id)}
        data-track-name={track.id}
      >
        {selectedPhaser && (
          <div className="pointer-events-none absolute inset-0 bg-indigo-500 opacity-0 transition-opacity group-hover:opacity-10" />
        )}

        {track.events.map((e) => (
          <DraggableBlock key={e.id} event={e} beatWidth={BEAT_WIDTH} />
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
            {/* Render sub-track events here if we want them editable later. 
               For now just show them as blocks */}
            {st.events.map((e) => (
              <DraggableBlock
                key={e.id}
                event={e}
                beatWidth={BEAT_WIDTH}
                isSubTrack={true}
                {...actions}
              />
            ))}
          </div>
        ))}
    </div>
  );
};
