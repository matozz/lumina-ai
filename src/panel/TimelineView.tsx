import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useUiStore } from '../stores/uiStore';
import { DroppableTrack, TimelineTrackData, UITimelineEvent } from './DroppableTrack';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineResourcePanel } from './TimelineResourcePanel';
import { TimelineTrackHeaders } from './TimelineTrackHeaders';
import { TimelineGrid } from './TimelineGrid';
import { TimelinePlayhead } from './TimelinePlayhead';
import { cn } from '@/lib/utils';
import type { TimelineEventDSL } from '../bridge/types';

export function TimelineView() {
  const { parsedDsl, globalBeat, compileResult, currentDslCode, setCurrentDslCode } = useUiStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackHeadersScrollRef = useRef<HTMLDivElement>(null);
  
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (trackHeadersScrollRef.current) {
      // Prevent macOS elastic scroll bounce from causing negative scrollTop
      // or scrolling beyond max height, which would misalign the two containers
      const target = e.currentTarget;
      const maxScrollTop = target.scrollHeight - target.clientHeight;
      const safeScrollTop = Math.max(0, Math.min(target.scrollTop, maxScrollTop));
      
      trackHeadersScrollRef.current.scrollTop = safeScrollTop;
    }
  };
  
  const [selectedPhaser, setSelectedPhaser] = useState<string | null>(null);
  const [expandedTracks, setExpandedTracks] = useState<Record<string, boolean>>({});
  
  useEffect(() => {
    if (selectedPhaser && compileResult?.phaser_names) {
      if (!compileResult.phaser_names.includes(selectedPhaser)) {
        setSelectedPhaser(null);
      }
    } else if (!compileResult?.phaser_names || compileResult.phaser_names.length === 0) {
      setSelectedPhaser(null);
    }
  }, [compileResult, selectedPhaser]);

  const [moving, setMoving] = useState<{
    originalIndex: number;
    startClientX: number;
    startClientY: number;
    startBeat: number;
    currentDeltaX: number;
    currentDeltaY: number;
    activeTrackName?: string;
  } | null>(null);

  const [resizing, setResizing] = useState<{
    originalIndex: number;
    startClientX: number;
    startDuration: number;
    currentDeltaX: number;
  } | null>(null);
  
  const BEAT_WIDTH = 40; 
  const interactionState = useRef<{ isInteracting: boolean }>({ isInteracting: false });
  
  const resolveOverlaps = useCallback((events: TimelineEventDSL[]) => {
    const tracks = new Map<string, TimelineEventDSL[]>();

    events.forEach(e => {
      let trackName = 'Global';
      if (e.action?.type === 'phaser') trackName = `Phaser: ${e.action.phaser}`;
      else if (e.action?.type === 'preset') trackName = `Preset: ${e.action.preset}`;
      else if (e.action?.type === 'animate') {
        // Animate events have their own tracks defined by their targets
        trackName = `Animate: ${e.action.target}`;
      }
      
      if (!tracks.has(trackName)) tracks.set(trackName, []);
      tracks.get(trackName)?.push(e);
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
            
            // Do not process cross-track dropping for animate blocks right now, just beat movement
            if (ev.action.type === 'animate') {
              if (ev.beat !== newBeat) {
                ev.beat = newBeat;
                dslObj.timeline.events = resolveOverlaps(dslObj.timeline.events);
                setCurrentDslCode(JSON.stringify(dslObj, null, 2));
              }
            } else {
              const isDifferentTrack = moving.activeTrackName && (
                (ev.action.type === 'phaser' && moving.activeTrackName !== `Phaser: ${ev.action.phaser}`) ||
                (ev.action.type === 'preset' && moving.activeTrackName !== `Preset: ${ev.action.preset}`)
              );

              if (ev.beat !== newBeat || isDifferentTrack) {
                ev.beat = newBeat;
                
                if (isDifferentTrack && moving.activeTrackName) {
                   if (moving.activeTrackName.startsWith('Phaser: ')) {
                    ev.action = { type: 'phaser', phaser: moving.activeTrackName.replace('Phaser: ', '') };
                  } else if (moving.activeTrackName.startsWith('Preset: ')) {
                    ev.action = { type: 'preset', preset: moving.activeTrackName.replace('Preset: ', '') };
                  }
                }

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

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>, _trackName: string) => {
    if (interactionState.current.isInteracting) return;
    if (!selectedPhaser) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const scrollLeft = scrollRef.current?.scrollLeft || 0;
    
    const rawBeat = (x + scrollLeft) / BEAT_WIDTH;
    const snappedBeat = Math.floor(rawBeat);
    
    const newEvent = { beat: snappedBeat, duration: 4, action: { type: 'phaser', phaser: selectedPhaser } };
    
    try {
      const dslObj = JSON.parse(currentDslCode);
      if (!dslObj.timeline) dslObj.timeline = { bpm: 120, events: [] };
      if (!dslObj.timeline.events) dslObj.timeline.events = [];
      
      dslObj.timeline.events.push(newEvent);
      dslObj.timeline.events = resolveOverlaps(dslObj.timeline.events);
      setCurrentDslCode(JSON.stringify(dslObj, null, 2));
    } catch (err) {
      console.error("Failed to update DSL", err);
    }
  };

  const handleDelete = (originalIndex: number) => {
    try {
      const dslObj = JSON.parse(currentDslCode);
      if (dslObj.timeline?.events) {
        dslObj.timeline.events.splice(originalIndex, 1);
        setCurrentDslCode(JSON.stringify(dslObj, null, 2));
      }
    } catch (err) {}
  };

  const timelineEvents = parsedDsl?.timeline?.events || [];

  const tracks = useMemo(() => {
    const trackMap = new Map<string, UITimelineEvent[]>();
    const animationsMap = new Map<string, UITimelineEvent[]>();
    
    timelineEvents.forEach((event: TimelineEventDSL, index: number) => {
      let displayBeat = event.beat;
      let displayDuration = event.duration || 4;
      let displayType = event.action?.type;
      
      // Handle Animate Actions differently
      if (displayType === 'animate' && event.action.type === 'animate') {
        const target = event.action.target; // e.g. "phaser:Circle Ripple.multiplier"
        
        let parentTrackName = 'Global';
        if (target.startsWith('phaser:')) {
            const parts = target.replace('phaser:', '').split('.');
            parentTrackName = `Phaser: ${parts[0]}`;
        } else if (target.startsWith('global.')) {
            parentTrackName = 'Global';
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
          _id: `timeline-anim-${index}`, 
          _originalIndex: index,
          beat: displayBeat,
          duration: displayDuration,
        };

        if (!animationsMap.has(parentTrackName)) {
            animationsMap.set(parentTrackName, []);
        }
        animationsMap.get(parentTrackName)?.push(e);
        return; // Skip normal track processing for animations
      }

      let displayTarget = '';
      if (displayType === 'phaser' && event.action.type === 'phaser') {
        displayTarget = event.action.phaser;
      } else if (displayType === 'preset' && event.action.type === 'preset') {
        displayTarget = event.action.preset;
      }
      
      if (moving && moving.originalIndex === index) {
        const deltaBeats = moving.currentDeltaX / BEAT_WIDTH;
        displayBeat = Math.max(0, Math.floor((moving.startBeat + deltaBeats) * 2) / 2);

        if (moving.activeTrackName) {
           if (moving.activeTrackName.startsWith('Phaser: ')) {
             displayType = 'phaser';
             displayTarget = moving.activeTrackName.replace('Phaser: ', '');
           } else if (moving.activeTrackName.startsWith('Preset: ')) {
             displayType = 'preset';
             displayTarget = moving.activeTrackName.replace('Preset: ', '');
           }
        }
      }

      if (resizing && resizing.originalIndex === index) {
        const deltaBeats = resizing.currentDeltaX / BEAT_WIDTH;
        displayDuration = Math.max(0.5, Math.round((resizing.startDuration + deltaBeats) * 2) / 2);
      }

      let trackName = 'Global';
      if (displayType === 'phaser') trackName = `Phaser: ${displayTarget}`;
      else if (displayType === 'preset') trackName = `Preset: ${displayTarget}`;

      const e: UITimelineEvent = { 
        ...event, 
        _id: `timeline-${index}`, 
        _originalIndex: index,
        beat: displayBeat,
        duration: displayDuration,
        action: { type: displayType, phaser: displayTarget, preset: displayTarget } as any
      };
      
      if (!trackMap.has(trackName)) {
        trackMap.set(trackName, []);
      }
      trackMap.get(trackName)?.push(e);
    });
    
    // Create final array with animations attached to tracks
    const result: TimelineTrackData[] = [];
    
    // Collect all unique track names
    const allTrackNames = new Set([...trackMap.keys(), ...animationsMap.keys()]);
    if (allTrackNames.size === 0) {
      allTrackNames.add('Track 1');
    }

    allTrackNames.forEach(name => {
        const trackEvents = trackMap.get(name) || [];
        const animEvents = animationsMap.get(name) || [];
        
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
            name,
            events: trackEvents,
            subTracks
        });
    });
    
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [timelineEvents, moving, resizing]);

  const maxBeatFromEvents = tracks.flatMap(t => t.events).length > 0 
    ? Math.max(...tracks.flatMap(t => t.events).map((e) => e.beat + (e.duration || 4)))
    : 0;
    
  const maxBeat = Math.max(32, maxBeatFromEvents, globalBeat + 8);
  const TOTAL_BEATS = Math.ceil(maxBeat / 4) * 4 + 4; 
  const SCROLL_WIDTH = TOTAL_BEATS * BEAT_WIDTH;
  const playheadX = globalBeat * BEAT_WIDTH;

  useEffect(() => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const scrollLeft = container.scrollLeft;
      const containerWidth = container.clientWidth;
      
      // Auto-scroll when playhead moves out of view
      if (playheadX > scrollLeft + containerWidth - 100) {
        container.scrollTo({ left: Math.max(0, playheadX - 100), behavior: 'auto' });
      } else if (playheadX < scrollLeft) {
        container.scrollTo({ left: Math.max(0, playheadX - 100), behavior: 'auto' });
      }
    }
  }, [playheadX]);

  return (
    <div className={cn(
      "h-96 border-t border-zinc-800 bg-zinc-950 flex flex-col relative shrink-0 z-20 shadow-[0_-8px_20px_rgba(0,0,0,0.5)] select-none"
    )}>
      <TimelineToolbar globalBeat={globalBeat} />
      
      <div className="flex-1 flex overflow-hidden">
        <TimelineResourcePanel 
          compileResult={compileResult} 
          selectedPhaser={selectedPhaser} 
          onSelectPhaser={setSelectedPhaser} 
        />

        <TimelineTrackHeaders 
          tracks={tracks} 
          activeTrackName={moving?.activeTrackName}
          scrollRef={trackHeadersScrollRef}
          globalBeat={globalBeat}
          expandedTracks={expandedTracks}
          setExpandedTracks={setExpandedTracks}
        />
        
        <div 
          ref={scrollRef} 
          onScroll={handleScroll}
          className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar relative bg-[#0a0a0c] overscroll-none"
        >
          <div style={{ width: SCROLL_WIDTH, height: '100%', position: 'relative' }}>
            <TimelineGrid totalBeats={TOTAL_BEATS} beatWidth={BEAT_WIDTH} />
            
            <div className="flex flex-col relative z-0">
              {tracks.map((t) => (
                <DroppableTrack
                  key={t.name}
                  track={t}
                  isExpanded={expandedTracks[t.name]}
                  beatWidth={BEAT_WIDTH}
                  selectedPhaser={selectedPhaser}
                  onGridClick={handleGridClick}
                  onDragStart={(e, originalIndex, startBeat) => {
                    setMoving({
                      originalIndex,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      startBeat,
                      currentDeltaX: 0,
                      currentDeltaY: 0,
                      activeTrackName: t.name
                    });
                  }}
                  onResizeStart={(e, originalIndex, startDuration) => {
                    setResizing({
                      originalIndex,
                      startClientX: e.clientX,
                      startDuration,
                      currentDeltaX: 0
                    });
                  }}
                  onDelete={handleDelete}
                />
              ))}
              {/* Spacer matching the extra padding in TrackHeaders */}
              <div 
                className="w-full h-10 border-b border-zinc-800/30" 
              />
              <div 
                className="flex-1 min-h-25" 
                onClick={() => {
                  if (!interactionState.current.isInteracting) {
                    setSelectedPhaser(null);
                  }
                }}
              />
            </div>
            
            <TimelinePlayhead playheadX={playheadX} />
          </div>
        </div>
      </div>
    </div>
  );
}
