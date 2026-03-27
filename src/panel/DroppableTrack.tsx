import React from 'react';
import { DraggableBlock } from './DraggableBlock';
import { cn } from '@/lib/utils';

interface TrackProps {
  track: any;
  beatWidth: number;
  selectedPhaser: string | null;
  onGridClick: (e: React.MouseEvent<HTMLDivElement>, trackName: string) => void;
  onDragStart: (e: React.PointerEvent, originalIndex: number, startBeat: number) => void;
  onResizeStart: (e: React.PointerEvent, originalIndex: number, startDuration: number) => void;
  onDelete: (originalIndex: number) => void;
}

export function DroppableTrack({ track, beatWidth, selectedPhaser, onGridClick, onDragStart, onResizeStart, onDelete }: TrackProps) {
  return (
    <div 
      className={cn(
        "h-12 border-b border-zinc-800/30 relative hover:bg-zinc-900/30 transition-colors group box-border",
        selectedPhaser && "cursor-crosshair"
      )}
      onClick={(e) => onGridClick(e, track.name)}
      data-track-name={track.name}
    >
      {selectedPhaser && (
        <div className="absolute inset-0 opacity-0 group-hover:opacity-10 bg-indigo-500 transition-opacity pointer-events-none" />
      )}
      
      {track.events.map((e: any) => (
        <DraggableBlock 
          key={e._id} 
          event={e} 
          beatWidth={beatWidth} 
          onDragStart={onDragStart}
          onResizeStart={onResizeStart}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
