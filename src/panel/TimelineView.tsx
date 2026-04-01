import { useRef, useEffect } from 'react';
import { useEngineStore, engineSelectors } from '../stores/engineStore';
import { useTimelineStore, timelineActions, timelineSelectors } from '../stores/timelineStore';
import { DroppableTrack } from './DroppableTrack';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineResourcePanel } from './TimelineResourcePanel';
import { TimelineTrackHeaders } from './TimelineTrackHeaders';
import { TimelineGrid } from './TimelineGrid';
import { TimelinePlayhead } from './TimelinePlayhead';
import { cn } from '@/lib/utils';
import { useTimelineEvents, BEAT_WIDTH } from './timeline/useTimelineEvents';
import { useTimelineTracks } from './timeline/useTimelineTracks';

export function TimelineView() {
  const globalBeat = useEngineStore(engineSelectors.globalBeat);
  const compileResult = useEngineStore(engineSelectors.compileResult);
  
  const selectedPhaser = useTimelineStore(timelineSelectors.selectedPhaser);
  const expandedTracks = useTimelineStore(timelineSelectors.expandedTracks);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackHeadersScrollRef = useRef<HTMLDivElement>(null);

  const {
    timelineEvents,
    moving,
    setMoving,
    resizing,
    setResizing,
    interactionState,
    addEvent,
    deleteEvent,
    updateAnimationBlock
  } = useTimelineEvents();

  const tracks = useTimelineTracks(timelineEvents, moving, resizing);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (trackHeadersScrollRef.current) {
      // Prevent macOS elastic scroll bounce from causing negative scrollTop
      const target = e.currentTarget;
      const maxScrollTop = target.scrollHeight - target.clientHeight;
      const safeScrollTop = Math.max(0, Math.min(target.scrollTop, maxScrollTop));
      
      trackHeadersScrollRef.current.scrollTop = safeScrollTop;
    }
  };
  
  useEffect(() => {
    if (selectedPhaser && compileResult?.phasers) {
      if (!compileResult.phasers.some((p) => p.id === selectedPhaser)) {
        timelineActions.setSelectedPhaser(null);
      }
    } else if (!compileResult?.phasers || compileResult.phasers.length === 0) {
      timelineActions.setSelectedPhaser(null);
    }
  }, [compileResult, selectedPhaser]);

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>, _trackName: string) => {
    if (interactionState.current.isInteracting) return;
    if (!selectedPhaser) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const scrollLeft = scrollRef.current?.scrollLeft || 0;
    
    const rawBeat = (x + scrollLeft) / BEAT_WIDTH;
    const snappedBeat = Math.floor(rawBeat);
    
    addEvent({ 
      beat: snappedBeat, 
      duration: 4, 
      action: { type: 'phaser', phaser: selectedPhaser } 
    });
  };

  const maxBeatFromEvents = tracks.flatMap((t) => t.events).length > 0 
    ? Math.max(...tracks.flatMap((t) => t.events).map((e) => e.beat + (e.duration || 4)))
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
          onSelectPhaser={timelineActions.setSelectedPhaser} 
        />

        <TimelineTrackHeaders 
          tracks={tracks} 
          activeTrackName={moving?.activeTrackName}
          scrollRef={trackHeadersScrollRef}
          globalBeat={globalBeat}
          expandedTracks={expandedTracks}
          setExpandedTracks={timelineActions.setExpandedTracks}
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
                  onDragStart={(e: React.PointerEvent, originalIndex: number, startBeat: number) => {
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
                  onResizeStart={(e: React.PointerEvent, originalIndex: number, startDuration: number) => {
                    setResizing({
                      originalIndex,
                      startClientX: e.clientX,
                      startDuration,
                      currentDeltaX: 0
                    });
                  }}
                  onDelete={deleteEvent}
                  onUpdateAnimation={updateAnimationBlock}
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
                    timelineActions.setSelectedPhaser(null);
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