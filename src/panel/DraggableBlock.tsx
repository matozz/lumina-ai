import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { UITimelineEvent } from './DroppableTrack';
import { AnimationBlockEditor } from './AnimationBlockEditor';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FromTo } from '@/bridge/types';

interface BlockProps {
  event: UITimelineEvent;
  beatWidth: number;
  isSubTrack?: boolean;
  onDragStart: (e: React.PointerEvent, originalIndex: number, startBeat: number) => void;
  onResizeStart: (e: React.PointerEvent, originalIndex: number, startDuration: number) => void;
  onDelete: (originalIndex: number) => void;
  onUpdateAnimation?: (eventIndex: number, fromValue: FromTo, toValue: FromTo, easing: string) => void;
}

export function DraggableBlock({ 
  event, 
  beatWidth, 
  isSubTrack, 
  onDragStart, 
  onResizeStart, 
  onDelete,
  onUpdateAnimation
}: BlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  
  const left = event.beat * beatWidth;
  const duration = event.duration || 4;
  const width = Math.max(beatWidth * 0.5, duration * beatWidth);
  
  const isPhaser = event.action.type === 'phaser';
  const isAnimate = event.action.type === 'animate';
  
  let label = event.action.type as string;
  if (event.action.type === 'phaser') label = event.action.phaser;
  else if (event.action.type === 'animate') {
    const parts = event.action.target.split('.');
    label = parts[parts.length - 1]; // e.g. "multiplier"
  }

  // Extract from/to from keyframes. Default to 0 -> 1
  let fromValue: FromTo = 0;
  let toValue: FromTo = 1;
  let easing = 'linear';
  
  if (isAnimate && event.action.type === 'animate') {
      fromValue = event.action.from !== undefined ? event.action.from : 0;
      toValue = event.action.to !== undefined ? event.action.to : 1;
      easing = event.action.easing || 'linear';
  }

  const handleClick = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (isAnimate && onUpdateAnimation) {
        setIsEditorOpen(true);
    }
  };

  const handleDoubleClick = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    onDelete(event.originalIndex);
  };

  return (
    <Popover open={isEditorOpen} onOpenChange={setIsEditorOpen}>
      <PopoverTrigger render={
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
          title={isAnimate ? `${label} (From: ${fromValue} -> To: ${toValue})` : `${label} (Beat ${event.beat} - ${event.beat + duration})`}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerDown={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
            onDragStart(ev, event.originalIndex, event.beat);
          }}
        >
          <div className="flex w-full justify-between items-center pointer-events-none px-1 overflow-hidden">
            <span className="text-[11px] font-medium text-white whitespace-nowrap text-ellipsis drop-shadow-md">
              {label}
            </span>
            {isAnimate && width > 60 && (
               <span className="text-[10px] text-amber-200/80 font-mono tracking-tighter ml-2 whitespace-nowrap">
                 {fromValue} → {toValue}
               </span>
            )}
          </div>
          
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
              onResizeStart(ev, event.originalIndex, duration);
            }}
          />
        </div>
      } />
      {isAnimate && onUpdateAnimation && (
        <PopoverContent className="w-64" sideOffset={5}>
          <AnimationBlockEditor
              fromValue={fromValue}
              toValue={toValue}
              easing={easing}
              onSave={(newFrom: FromTo, newTo: FromTo, newEasing: string) => {
                  onUpdateAnimation(event.originalIndex, newFrom, newTo, newEasing);
                  setIsEditorOpen(false);
              }}
              onClose={() => setIsEditorOpen(false)}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}
