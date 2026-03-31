import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { KeyframeDSL } from '../bridge/types';
import { BEAT_WIDTH } from './timeline/useTimelineEvents';

interface KeyframeDotProps {
  keyframe: KeyframeDSL;
  index: number;
  eventDuration: number;
  originalEventIndex: number;
  onUpdate: (eventIndex: number, keyframeIndex: number, updates: Partial<KeyframeDSL>) => void;
  onDelete: (eventIndex: number, keyframeIndex: number) => void;
  onClick: (e: React.MouseEvent, keyframe: KeyframeDSL, eventIndex: number, keyframeIndex: number) => void;
}

export function KeyframeDot({ 
  keyframe, 
  index, 
  eventDuration, 
  originalEventIndex, 
  onUpdate, 
  onDelete,
  onClick
}: KeyframeDotProps) {
  const dotRef = useRef<HTMLDivElement>(null);
  
  // Use raw pointer events to allow 60fps dragging without triggering React renders
  useEffect(() => {
    const el = dotRef.current;
    if (!el) return;

    let isDragging = false;
    let startClientX = 0;
    let startTime = 0;

    const onPointerDown = (e: PointerEvent) => {
      // Only left click
      if (e.button !== 0) return;
      
      e.stopPropagation();
      isDragging = true;
      startClientX = e.clientX;
      startTime = keyframe.time;
      el.setPointerCapture(e.pointerId);
      el.classList.add('scale-150', 'ring-2', 'ring-amber-400');
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      e.stopPropagation();

      const deltaBeats = (e.clientX - startClientX) / BEAT_WIDTH;
      let newTime = startTime + deltaBeats;
      
      // Clamp between 0 and eventDuration
      newTime = Math.max(0, Math.min(newTime, eventDuration));
      
      // Update visual immediately via DOM
      const kfLeft = (newTime / eventDuration) * 100;
      el.style.left = `calc(${kfLeft}% - 3px)`;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      e.stopPropagation();
      isDragging = false;
      el.releasePointerCapture(e.pointerId);
      el.classList.remove('scale-150', 'ring-2', 'ring-amber-400');

      const deltaBeats = (e.clientX - startClientX) / BEAT_WIDTH;
      let newTime = startTime + deltaBeats;
      newTime = Math.max(0, Math.min(newTime, eventDuration));
      
      // Snap to 0.1 beat grid if dragged
      if (Math.abs(newTime - startTime) > 0.05) {
         newTime = Math.round(newTime * 10) / 10;
         onUpdate(originalEventIndex, index, { time: newTime });
      } else {
         // Reset style to what React expects if not dragged significantly
         const kfLeft = (keyframe.time / eventDuration) * 100;
         el.style.left = `calc(${kfLeft}% - 3px)`;
      }
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
    };
  }, [keyframe.time, eventDuration, originalEventIndex, index, onUpdate]);

  const kfLeft = (keyframe.time / eventDuration) * 100;

  return (
    <div 
      ref={dotRef}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-amber-200 rounded-full shadow-[0_0_4px_rgba(251,191,36,0.8)]",
        "hover:scale-150 hover:bg-amber-100 transition-transform cursor-ew-resize z-20"
      )}
      style={{ left: `calc(${kfLeft}% - 3px)`, touchAction: 'none' }}
      title={`Time: +${keyframe.time.toFixed(2)}b | Value: ${String(keyframe.value)}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e, keyframe, originalEventIndex, index);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDelete(originalEventIndex, index);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e, keyframe, originalEventIndex, index);
      }}
    />
  );
}
