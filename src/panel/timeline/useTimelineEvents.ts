import { useCallback, useEffect, useRef, useState } from "react";
import type { TimelineEventDSL } from "../../bridge/types";
import { useUiStore } from "../../stores/uiStore";

export const BEAT_WIDTH = 40;

export interface MovingState {
  originalIndex: number;
  startClientX: number;
  startClientY: number;
  startBeat: number;
  currentDeltaX: number;
  currentDeltaY: number;
  activeTrackName?: string;
}

export interface ResizingState {
  originalIndex: number;
  startClientX: number;
  startDuration: number;
  currentDeltaX: number;
}

export function useTimelineEvents() {
  const { parsedDsl, currentDslCode, setCurrentDslCode } = useUiStore();
  
  const [moving, setMoving] = useState<MovingState | null>(null);
  const [resizing, setResizing] = useState<ResizingState | null>(null);
  
  const interactionState = useRef<{ isInteracting: boolean }>({ isInteracting: false });

  const timelineEvents = parsedDsl?.timeline?.events || [];

  const resolveOverlaps = useCallback((events: TimelineEventDSL[]) => {
    const tracks = new Map<string, TimelineEventDSL[]>();

    events.forEach(e => {
      // Create a deterministic group key based on action
      let groupKey = 'global';
      
      if (e.action.type === 'phaser') {
        groupKey = `phaser:${e.action.phaser}`;
      } else if (e.action.type === 'animate') {
        groupKey = `animate:${e.action.target}`;
      }
      
      if (!tracks.has(groupKey)) tracks.set(groupKey, []);
      tracks.get(groupKey)?.push(e);
    });
    
    const resolvedEvents: TimelineEventDSL[] = [];
    
    tracks.forEach((trackEvents) => {
      trackEvents.sort((a, b) => a.beat - b.beat);
      for (let i = 0; i < trackEvents.length; i++) {
        const current = trackEvents[i];
        if (i < trackEvents.length - 1) {
          const next = trackEvents[i + 1];
          const currentEnd = current.beat + (current.duration || 4);
          if (currentEnd > next.beat) {
            current.duration = Math.max(0.5, next.beat - current.beat);
          }
        }
        resolvedEvents.push(current);
      }
    });
    
    return resolvedEvents.sort((a, b) => a.beat - b.beat);
  }, []);

  const addEvent = useCallback((newEvent: TimelineEventDSL) => {
    try {
      const dslObj = JSON.parse(currentDslCode);
      if (!dslObj.timeline) dslObj.timeline = { events: [] };
      if (!dslObj.timeline.events) dslObj.timeline.events = [];
      
      dslObj.timeline.events.push(newEvent);
      dslObj.timeline.events = resolveOverlaps(dslObj.timeline.events);
      setCurrentDslCode(JSON.stringify(dslObj, null, 2));
    } catch (err) {
      console.error("Failed to update DSL", err);
    }
  }, [currentDslCode, setCurrentDslCode, resolveOverlaps]);

  const deleteEvent = useCallback((originalIndex: number) => {
    try {
      const dslObj = JSON.parse(currentDslCode);
      if (dslObj.timeline?.events) {
        dslObj.timeline.events.splice(originalIndex, 1);
        setCurrentDslCode(JSON.stringify(dslObj, null, 2));
      }
    } catch (err) {}
  }, [currentDslCode, setCurrentDslCode]);

  useEffect(() => {
    if (!resizing && !moving) return;
    
    const handlePointerMove = (e: PointerEvent) => {
      interactionState.current.isInteracting = true;
      
      if (resizing) {
        setResizing(prev => prev ? { ...prev, currentDeltaX: e.clientX - prev.startClientX } : null);
      }

      if (moving) {
        let activeTrackName = moving.activeTrackName;
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        const trackEl = elements.find(el => el.hasAttribute('data-track-name'));
        if (trackEl) {
          activeTrackName = trackEl.getAttribute('data-track-name') || undefined;
        }

        setMoving(prev => prev ? {
          ...prev,
          currentDeltaX: e.clientX - prev.startClientX,
          currentDeltaY: e.clientY - prev.startClientY,
          activeTrackName
        } : null);
      }
    };
    
    const handlePointerUp = () => {
      if (resizing) {
        const deltaBeats = resizing.currentDeltaX / BEAT_WIDTH;
        const newDuration = Math.max(0.5, Math.round((resizing.startDuration + deltaBeats) * 2) / 2);
        
        try {
          const dslObj = JSON.parse(currentDslCode);
          if (dslObj.timeline?.events?.[resizing.originalIndex]) {
            if (dslObj.timeline.events[resizing.originalIndex].duration !== newDuration) {
              dslObj.timeline.events[resizing.originalIndex].duration = newDuration;
              dslObj.timeline.events = resolveOverlaps(dslObj.timeline.events);
              setCurrentDslCode(JSON.stringify(dslObj, null, 2));
            }
          }
        } catch (err) {}
      }

      if (moving) {
        const deltaBeats = moving.currentDeltaX / BEAT_WIDTH;
        const newBeat = Math.max(0, Math.floor((moving.startBeat + deltaBeats) * 2) / 2);
        
        try {
          const dslObj = JSON.parse(currentDslCode);
          if (dslObj.timeline?.events?.[moving.originalIndex]) {
            const ev = dslObj.timeline.events[moving.originalIndex];
            
            if (ev.action.type === 'animate') {
              if (ev.beat !== newBeat) {
                ev.beat = newBeat;
                dslObj.timeline.events = resolveOverlaps(dslObj.timeline.events);
                setCurrentDslCode(JSON.stringify(dslObj, null, 2));
              }
            } else if (ev.action.type === 'phaser') {
              // Extract the target phaser ID if dragging onto a specific track
              let targetPhaserId = ev.action.phaser;
              
              if (moving.activeTrackName?.startsWith('phaser:')) {
                targetPhaserId = moving.activeTrackName.replace('phaser:', '');
              }

              const isDifferentTrack = targetPhaserId !== ev.action.phaser;

              if (ev.beat !== newBeat || isDifferentTrack) {
                ev.beat = newBeat;
                ev.action.phaser = targetPhaserId;

                dslObj.timeline.events = resolveOverlaps(dslObj.timeline.events);
                setCurrentDslCode(JSON.stringify(dslObj, null, 2));
              }
            }
          }
        } catch(err) {}
      }
      
      setResizing(null);
      setMoving(null);

      setTimeout(() => {
        interactionState.current.isInteracting = false;
      }, 50);
    };
    
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [resizing, moving, currentDslCode, setCurrentDslCode, resolveOverlaps]);

  return {
    timelineEvents,
    moving,
    setMoving,
    resizing,
    setResizing,
    interactionState,
    addEvent,
    deleteEvent
  };
}