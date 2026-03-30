import React from 'react';
import { DraggableBlock } from './DraggableBlock';
import { cn } from '@/lib/utils';
import type { TimelineEventDSL } from '../bridge/types';

export interface UITimelineEvent extends TimelineEventDSL {
  id: string;
  originalIndex: number;
}

export interface TimelineTrackData {
  id: string;
  name: string;
  events: UITimelineEvent[];
  subTracks?: { 
    name: string; 
    events: UITimelineEvent[]; 
  }[];
}

interface TrackProps {
  track: TimelineTrackData;
  isExpanded?: boolean;
  beatWidth: number;
  selectedPhaser: string | null;
  onGridClick: (e: React.MouseEvent<HTMLDivElement>, trackName: string) => void;
  onDragStart: (e: React.PointerEvent, originalIndex: number, startBeat: number) => void;
  onResizeStart: (e: React.PointerEvent, originalIndex: number, startDuration: number) => void;
  onDelete: (originalIndex: number) => void;
}

export function DroppableTrack({ track, isExpanded, beatWidth, selectedPhaser, onGridClick, onDragStart, onResizeStart, onDelete }: TrackProps) {
  return (
    <div className="flex flex-col">
      <div 
        className={cn(
          "h-10 border-b border-zinc-800/30 relative hover:bg-zinc-900/30 transition-colors group box-border",
          selectedPhaser && "cursor-crosshair"
        )}
        onClick={(e) => onGridClick(e, track.id)}
        data-track-name={track.id}
      >
        {selectedPhaser && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-10 bg-indigo-500 transition-opacity pointer-events-none" />
        )}
        
        {track.events.map((e) => (
          <DraggableBlock 
            key={e.id} 
            event={e} 
            beatWidth={beatWidth} 
            onDragStart={onDragStart}
            onResizeStart={onResizeStart}
            onDelete={onDelete}
          />
        ))}
      </div>
      
      {isExpanded && track.subTracks && track.subTracks.map(st => (
        <div 
          key={`${track.name}-${st.name}`}
          className={cn(
            "h-8 border-b border-zinc-800/20 relative transition-colors group box-border bg-black/20"
          )}
        >
           {/* Render sub-track events here if we want them editable later. 
               For now just show them as blocks */}
           {st.events.map((e) => (
              <DraggableBlock 
                key={e.id} 
                event={e} 
                beatWidth={beatWidth} 
                isSubTrack={true}
                onDragStart={onDragStart}
                onResizeStart={onResizeStart}
                onDelete={onDelete}
              />
            ))}
        </div>
      ))}
    </div>
  );
}


