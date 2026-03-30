import { useMemo } from "react";
import type { TimelineEventDSL } from "../../bridge/types";
import type { UITimelineEvent, TimelineTrackData } from "../DroppableTrack";
import { BEAT_WIDTH, type MovingState, type ResizingState } from "./useTimelineEvents";

export function useTimelineTracks(
  timelineEvents: TimelineEventDSL[],
  moving: MovingState | null,
  resizing: ResizingState | null
) {
  return useMemo(() => {
    const trackMap = new Map<string, UITimelineEvent[]>();
    const animationsMap = new Map<string, UITimelineEvent[]>();
    
    timelineEvents.forEach((event: TimelineEventDSL, index: number) => {
      let displayBeat = event.beat;
      let displayDuration = event.duration || 4;
      let displayType = event.action?.type;
      
      // Handle Animate Actions differently
      if (displayType === 'animate' && event.action.type === 'animate') {
        const target = event.action.target; // e.g. "phaser:Circle Ripple.multiplier"
        
        let parentTrackId = 'global';
        if (target.startsWith('phaser:')) {
            const parts = target.replace('phaser:', '').split('.');
            parentTrackId = `phaser:${parts[0]}`;
        }
        
        if (moving && moving.originalIndex === index) {
          const deltaBeats = moving.currentDeltaX / BEAT_WIDTH;
          displayBeat = Math.max(0, Math.floor((moving.startBeat + deltaBeats) * 2) / 2);
        }

        if (resizing && resizing.originalIndex === index) {
          const deltaBeats = resizing.currentDeltaX / BEAT_WIDTH;
          displayDuration = Math.max(0.5, Math.round((resizing.startDuration + deltaBeats) * 2) / 2);
        }

        const e: UITimelineEvent = { 
          ...event, 
          id: `timeline-anim-${index}`, 
          originalIndex: index,
          beat: displayBeat,
          duration: displayDuration,
        };

        if (!animationsMap.has(parentTrackId)) {
            animationsMap.set(parentTrackId, []);
        }
        animationsMap.get(parentTrackId)?.push(e);
        return; // Skip normal track processing for animations
      }

      let displayTarget = '';
      if (displayType === 'phaser' && event.action.type === 'phaser') {
        displayTarget = event.action.phaser;
      }
      
      if (moving && moving.originalIndex === index) {
        const deltaBeats = moving.currentDeltaX / BEAT_WIDTH;
        displayBeat = Math.max(0, Math.floor((moving.startBeat + deltaBeats) * 2) / 2);

        if (moving.activeTrackName?.startsWith('phaser:')) {
           displayType = 'phaser';
           displayTarget = moving.activeTrackName.replace('phaser:', '');
        }
      }

      if (resizing && resizing.originalIndex === index) {
        const deltaBeats = resizing.currentDeltaX / BEAT_WIDTH;
        displayDuration = Math.max(0.5, Math.round((resizing.startDuration + deltaBeats) * 2) / 2);
      }

      let trackId = 'global';
      if (displayType === 'phaser') trackId = `phaser:${displayTarget}`;

      const e: UITimelineEvent = { 
        ...event, 
        id: `timeline-${index}`, 
        originalIndex: index,
        beat: displayBeat,
        duration: displayDuration,
        action: { type: displayType, phaser: displayTarget } as any
      };
      
      if (!trackMap.has(trackId)) {
        trackMap.set(trackId, []);
      }
      trackMap.get(trackId)?.push(e);
    });
    
    // Create final array with animations attached to tracks
    const result: TimelineTrackData[] = [];
    
    // Collect all unique track names
    const allTrackIds = new Set([...trackMap.keys(), ...animationsMap.keys()]);
    if (allTrackIds.size === 0) {
      allTrackIds.add('global');
    }

    allTrackIds.forEach(trackId => {
        const trackEvents = trackMap.get(trackId) || [];
        const animEvents = animationsMap.get(trackId) || [];
        
        // Group animations by specific property (e.g. "multiplier", "color")
        const subTracksMap = new Map<string, UITimelineEvent[]>();
        animEvents.forEach(e => {
            if (e.action.type === 'animate') {
              const parts = e.action.target.split('.');
              const propName = parts[parts.length - 1]; // "multiplier"
              if (!subTracksMap.has(propName)) subTracksMap.set(propName, []);
              subTracksMap.get(propName)?.push(e);
            }
        });

        const subTracks = Array.from(subTracksMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([propName, evs]) => ({
                name: propName,
                events: evs
            }));

        result.push({
            id: trackId, // Explicit structured ID
            name: trackId, // Renderable string
            events: trackEvents,
            subTracks
        });
    });
    
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [timelineEvents, moving, resizing]);
}