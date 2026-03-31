import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { UITimelineEvent } from './DroppableTrack';
import { KeyframeDot } from './KeyframeDot';
import { KeyframeEditorPopover } from './KeyframeEditorPopover';
import type { KeyframeDSL } from '../bridge/types';

interface BlockProps {
  event: UITimelineEvent;
  beatWidth: number;
  isSubTrack?: boolean;
  onDragStart: (e: React.PointerEvent, originalIndex: number, startBeat: number) => void;
  onResizeStart: (e: React.PointerEvent, originalIndex: number, startDuration: number) => void;
  onDelete: (originalIndex: number) => void;
  onAddKeyframe?: (eventIndex: number, time: number) => void;
  onUpdateKeyframe?: (eventIndex: number, keyframeIndex: number, updates: any) => void;
  onDeleteKeyframe?: (eventIndex: number, keyframeIndex: number) => void;
}

export function DraggableBlock({ 
  event, 
  beatWidth, 
  isSubTrack, 
  onDragStart, 
  onResizeStart, 
  onDelete,
  onAddKeyframe,
  onUpdateKeyframe,
  onDeleteKeyframe
}: BlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [selectedKeyframe, setSelectedKeyframe] = useState<{kf: KeyframeDSL, eventIndex: number, keyframeIndex: number, x: number, y: number} | null>(null);
  
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

  const handleDoubleClick = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    
    if (isAnimate && onAddKeyframe && ref.current) {
        // Double click to add keyframe
        const rect = ref.current.getBoundingClientRect();
        const offsetX = ev.clientX - rect.left;
        const relativeTime = (offsetX / width) * (event.duration || 4);
        
        // Snap to nearest 0.1 beat
        const snappedTime = Math.round(relativeTime * 10) / 10;
        
        // Make sure it's within bounds
        if (snappedTime >= 0 && snappedTime <= (event.duration || 4)) {
           onAddKeyframe(event.originalIndex, snappedTime);
           return;
        }
    }
    
    // Otherwise, normal double click behavior (delete block)
    onDelete(event.originalIndex);
  };

  const handleKeyframeClick = (e: React.MouseEvent, kf: KeyframeDSL, eventIndex: number, keyframeIndex: number) => {
     setSelectedKeyframe({
        kf,
        eventIndex,
        keyframeIndex,
        x: e.clientX,
        y: e.clientY
     });
  };

  return (
    <>
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
      title={isAnimate ? `${label} (Double click to add keyframe)` : `${label} (Beat ${event.beat} - ${event.beat + (event.duration||4)})`}
      onClick={(ev) => ev.stopPropagation()}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(ev) => {
         // Prevent context menu from appearing when double clicking / right clicking to manage keyframes
         if (isAnimate) {
             ev.preventDefault();
             ev.stopPropagation();
         }
      }}
      onPointerDown={(ev) => {
        // Only drag if we didn't click on a keyframe
        if ((ev.target as HTMLElement).closest('.bg-amber-200')) return;
        
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
      {isAnimate && keyframes.map((kf, i) => (
        <KeyframeDot
           key={i}
           keyframe={kf}
           index={i}
           eventDuration={event.duration || 4}
           originalEventIndex={event.originalIndex}
           onUpdate={(ei, ki, up) => onUpdateKeyframe && onUpdateKeyframe(ei, ki, up)}
           onDelete={(ei, ki) => onDeleteKeyframe && onDeleteKeyframe(ei, ki)}
           onClick={handleKeyframeClick}
        />
      ))}
      
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
    
    {selectedKeyframe && (
        <KeyframeEditorPopover
            isOpen={true}
            onClose={() => setSelectedKeyframe(null)}
            x={selectedKeyframe.x}
            y={selectedKeyframe.y}
            keyframe={selectedKeyframe.kf}
            onUpdate={(updates) => {
                if (onUpdateKeyframe) {
                    onUpdateKeyframe(selectedKeyframe.eventIndex, selectedKeyframe.keyframeIndex, updates);
                }
            }}
            onDelete={() => {
                if (onDeleteKeyframe) {
                    onDeleteKeyframe(selectedKeyframe.eventIndex, selectedKeyframe.keyframeIndex);
                }
                setSelectedKeyframe(null);
            }}
        />
    )}
    </>
  );
}
