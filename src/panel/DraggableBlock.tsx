import React, { useRef } from 'react';
import { cn } from '@/lib/utils';
import type { UITimelineEvent } from './DroppableTrack';

interface BlockProps {
  event: UITimelineEvent;
  beatWidth: number;
  isSubTrack?: boolean;
  onDragStart: (e: React.PointerEvent, originalIndex: number, startBeat: number) => void;
  onResizeStart: (e: React.PointerEvent, originalIndex: number, startDuration: number) => void;
  onDelete: (originalIndex: number) => void;
}

export function DraggableBlock({ event, beatWidth, isSubTrack, onDragStart, onResizeStart, onDelete }: BlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  
  const left = event.beat * beatWidth;
  const width = Math.max(beatWidth * 0.5, (event.duration || 4) * beatWidth);
  
  const isPhaser = event.action.type === 'phaser';
  const isAnimate = event.action.type === 'animate';
  
  let label = event.action.type as string;
  if (event.action.type === 'phaser') label = event.action.phaser;
  else if (event.action.type === 'animate') {
    const parts = event.action.target.split('.');
    label = parts[parts.length - 1]; // e.g. "multiplier"
  }

  // Calculate keyframe positions if it's an animation block
  const keyframes = event.action.type === 'animate' ? event.action.keyframes : [];

  return (
    <div 
      ref={ref}
      className={cn(
        "group absolute rounded border flex items-center overflow-hidden shadow-sm transition-colors cursor-grab active:cursor-grabbing",
        isSubTrack ? "top-1 bottom-1 px-1.5" : "top-1.5 bottom-1.5 px-2",
        !isSubTrack && "backdrop-blur-md",
        
        isPhaser && "bg-indigo-600/80 hover:bg-indigo-500/90 border-indigo-400",
        isAnimate && "bg-amber-600/50 hover:bg-amber-500/70 border-amber-500/50",
        !isPhaser && !isAnimate && "bg-zinc-700/80 border-zinc-500"
      )}
      style={{ 
        left, 
        width,
        zIndex: isSubTrack ? 5 : 10,
        touchAction: 'none'
      }}
      title={`${label} (Beat ${event.beat} - ${event.beat + (event.duration||4)})`}
      onClick={(ev) => ev.stopPropagation()}
      onDoubleClick={(ev) => {
        ev.stopPropagation();
        onDelete(event.originalIndex);
      }}
      onPointerDown={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
        onDragStart(ev, event.originalIndex, event.beat);
      }}
    >
      {!isAnimate && (
        <span className="text-[11px] font-medium text-white whitespace-nowrap text-ellipsis drop-shadow-md pointer-events-none">
          {label}
        </span>
      )}
      
      {/* Keyframe visualizers */}
      {isAnimate && keyframes.map((kf, i) => {
        const kfLeft = (kf.time / (event.duration || 4)) * 100;
        return (
          <div 
            key={i}
            className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-amber-200 rounded-full shadow-[0_0_4px_rgba(251,191,36,0.8)] pointer-events-none"
            style={{ left: `calc(${kfLeft}% - 3px)` }}
            title={`Value: ${String(kf.value)} @ +${kf.time}b`}
          />
        );
      })}
      
      {/* Resize handle */}
      <div 
        className={cn(
          "absolute right-0 top-0 bottom-0 w-2 hover:bg-white/20 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
        )}
        style={{ pointerEvents: 'auto', touchAction: 'none' }}
        title="Drag to resize"
        onPointerDown={(ev) => {
          ev.preventDefault(); 
          ev.stopPropagation();
          (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
          onResizeStart(ev, event.originalIndex, event.duration || 4);
        }}
      />
    </div>
  );
}
