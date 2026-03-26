import React, { useRef } from 'react';
import { cn } from '../utils/cn';

interface BlockProps {
  event: any;
  beatWidth: number;
  onDragStart: (e: React.PointerEvent, originalIndex: number, startBeat: number) => void;
  onResizeStart: (e: React.PointerEvent, originalIndex: number, startDuration: number) => void;
  onDelete: (originalIndex: number) => void;
}

export function DraggableBlock({ event, beatWidth, onDragStart, onResizeStart, onDelete }: BlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  
  const left = event.beat * beatWidth;
  const width = Math.max(beatWidth * 0.5, (event.duration || 4) * beatWidth);
  
  const isPhaser = event.action.type === 'phaser';
  const isPreset = event.action.type === 'preset';
  
  const label = isPhaser ? event.action.phaser : isPreset ? event.action.preset : event.action.type;

  return (
    <div 
      ref={ref}
      className={cn(
        "group absolute top-1.5 bottom-1.5 rounded border flex items-center px-2 overflow-hidden shadow-sm backdrop-blur-md transition-colors cursor-grab active:cursor-grabbing",
        isPhaser && "bg-indigo-600/80 hover:bg-indigo-500/90 border-indigo-400",
        isPreset && "bg-emerald-600/80 hover:bg-emerald-500/90 border-emerald-400",
        !isPhaser && !isPreset && "bg-zinc-700/80 border-zinc-500"
      )}
      style={{ 
        left, 
        width,
        zIndex: 10,
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
      <span className="text-[11px] font-medium text-white whitespace-nowrap text-ellipsis drop-shadow-md pointer-events-none">
        {label}
      </span>
      
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
