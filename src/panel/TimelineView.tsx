import { useRef, useEffect } from "react";
import { useEngineStore, engineSelectors } from "@/stores/engine";
import { useTimelineStore, timelineActions, timelineSelectors } from "@/stores/timeline";
import { DroppableTrack } from "./components/timeline/DroppableTrack";
import { TimelineToolbar } from "./components/timeline/TimelineToolbar";
import { TimelineResourcePanel } from "./components/timeline/TimelineResourcePanel";
import { TimelineTrackHeaders } from "./components/timeline/TimelineTrackHeaders";
import { TimelineGrid } from "./components/timeline/TimelineGrid";
import { TimelinePlayhead } from "./components/timeline/TimelinePlayhead";
import { cn } from "@/lib/utils";
import { useTimelineEvents } from "./hooks/useTimelineEvents";
import { useTimelineTracks } from "./hooks/useTimelineTracks";
import { TimelineActionContext, BEAT_WIDTH } from "./context/TimelineContext";
import { calculateTimelineDimensions } from "./utils";

export const TimelineView = () => {
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
    updateAnimationBlock,
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
      action: { type: "phaser", phaser: selectedPhaser },
    });
  };

  const timelineActionsValue = {
    onDragStart: (e: React.PointerEvent, originalIndex: number, startBeat: number) => {
      setMoving({
        originalIndex,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startBeat,
        currentDeltaX: 0,
        currentDeltaY: 0,
        activeTrackName: tracks.find((t) =>
          t.events.some((ev) => ev.originalIndex === originalIndex),
        )?.id,
      });
    },
    onResizeStart: (e: React.PointerEvent, originalIndex: number, startDuration: number) => {
      setResizing({
        originalIndex,
        startClientX: e.clientX,
        startDuration,
        currentDeltaX: 0,
      });
    },
    onDelete: deleteEvent,
    onUpdateAnimation: updateAnimationBlock,
    onGridClick: handleGridClick,
  };

  const {
    totalBeats: TOTAL_BEATS,
    scrollWidth: SCROLL_WIDTH,
    playheadX,
  } = calculateTimelineDimensions(tracks, globalBeat);

  useEffect(() => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const scrollLeft = container.scrollLeft;
      const containerWidth = container.clientWidth;

      // Auto-scroll when playhead moves out of view
      if (playheadX > scrollLeft + containerWidth - 100) {
        container.scrollTo({ left: Math.max(0, playheadX - 100), behavior: "auto" });
      } else if (playheadX < scrollLeft) {
        container.scrollTo({ left: Math.max(0, playheadX - 100), behavior: "auto" });
      }
    }
  }, [playheadX]);

  return (
    <div
      className={cn(
        "relative z-20 flex h-96 shrink-0 flex-col border-t border-zinc-800 bg-zinc-950 shadow-[0_-8px_20px_rgba(0,0,0,0.5)] select-none",
      )}
    >
      <TimelineToolbar globalBeat={globalBeat} />

      <div className="flex flex-1 overflow-hidden">
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

        <TimelineActionContext.Provider value={timelineActionsValue}>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="custom-scrollbar relative flex-1 overflow-x-auto overflow-y-auto overscroll-none bg-[#0a0a0c]"
          >
            <div style={{ width: SCROLL_WIDTH, height: "100%", position: "relative" }}>
              <TimelineGrid totalBeats={TOTAL_BEATS} beatWidth={BEAT_WIDTH} />

              <div className="relative z-0 flex flex-col">
                {tracks.map((t) => (
                  <DroppableTrack
                    key={t.name}
                    track={t}
                    isExpanded={expandedTracks[t.name]}
                    selectedPhaser={selectedPhaser}
                  />
                ))}
                {/* Spacer matching the extra padding in TrackHeaders */}
                <div className="h-10 w-full border-b border-zinc-800/30" />
                <div
                  className="min-h-25 flex-1"
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
        </TimelineActionContext.Provider>
      </div>
    </div>
  );
};
