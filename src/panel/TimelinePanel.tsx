import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEngineStore, engineActions, engineSelectors } from "@/stores/engine";
import { useTimelineStore, timelineActions, timelineSelectors } from "@/stores/timeline";
import { cn } from "@/lib/utils";
import { useTimelineEvents } from "./hooks/useTimelineEvents";
import { useTimelineTracks } from "./hooks/useTimelineTracks";
import { TimelineActionContext, BEAT_WIDTH } from "./context/TimelineContext";
import { calculateTimelineDimensions } from "./utils";
import { viewportFromScroll, type TimelineViewport } from "./virtualization";
import {
  TimelineToolbar,
  TimelineResourcePanel,
  TimelineTrackHeaders,
  TimelineGrid,
  DroppableTrack,
  TimelinePlayhead,
} from "./components";

export const TimelinePanel = () => {
  const compileResult = useEngineStore(engineSelectors.compileResult);
  const canUndo = useEngineStore(engineSelectors.canUndo);
  const canRedo = useEngineStore(engineSelectors.canRedo);
  const isDocumentDirty = useEngineStore(engineSelectors.isDocumentDirty);

  const selectedPhaser = useTimelineStore(timelineSelectors.selectedPhaser);
  const expandedTracks = useTimelineStore(timelineSelectors.expandedTracks);

  const scrollRef = useRef<HTMLDivElement>(null);
  const trackHeadersScrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<TimelineViewport>({ startBeat: 0, endBeat: 40 });

  const {
    timelineEvents,
    interactionState,
    startMoving,
    startResizing,
    addEvent,
    deleteEvent,
    nudgeEvent,
    updateAnimationBlock,
  } = useTimelineEvents();

  const tracks = useTimelineTracks(timelineEvents);

  const updateViewport = useCallback((container: HTMLDivElement) => {
    const next = viewportFromScroll(container.scrollLeft, container.clientWidth, BEAT_WIDTH);
    setViewport((current) =>
      current.startBeat === next.startBeat && current.endBeat === next.endBeat ? current : next,
    );
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    updateViewport(e.currentTarget);
    if (trackHeadersScrollRef.current) {
      // Prevent macOS elastic scroll bounce from causing negative scrollTop
      const target = e.currentTarget;
      const maxScrollTop = target.scrollHeight - target.clientHeight;
      const safeScrollTop = Math.max(0, Math.min(target.scrollTop, maxScrollTop));

      trackHeadersScrollRef.current.scrollTop = safeScrollTop;
    }
  };

  useEffect(() => {
    const update = () => {
      if (scrollRef.current) updateViewport(scrollRef.current);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [updateViewport]);

  useEffect(() => {
    if (selectedPhaser && compileResult?.phasers) {
      if (!compileResult.phasers.some((p) => p.id === selectedPhaser)) {
        timelineActions.setSelectedPhaser(null);
      }
    } else if (!compileResult?.phasers || compileResult.phasers.length === 0) {
      timelineActions.setSelectedPhaser(null);
    }
  }, [compileResult, selectedPhaser]);

  const handleGridClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, _trackName: string) => {
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
        action: { type: "effect", instance_id: selectedPhaser },
      });
    },
    [addEvent, interactionState, selectedPhaser],
  );

  const timelineActionsValue = useMemo(
    () => ({
      onDragStart: (
        e: React.PointerEvent,
        originalIndex: number,
        startBeat: number,
        element: HTMLElement,
      ) => {
        startMoving(
          originalIndex,
          e.clientX,
          e.clientY,
          startBeat,
          tracks.find((track) =>
            track.events.some((event) => event.originalIndex === originalIndex),
          )?.id,
          element,
        );
      },
      onResizeStart: (
        e: React.PointerEvent,
        originalIndex: number,
        startDuration: number,
        element: HTMLElement,
      ) => startResizing(originalIndex, e.clientX, startDuration, element),
      onDelete: deleteEvent,
      onNudge: nudgeEvent,
      onUpdateAnimation: updateAnimationBlock,
      onGridClick: handleGridClick,
    }),
    [
      deleteEvent,
      handleGridClick,
      nudgeEvent,
      startMoving,
      startResizing,
      tracks,
      updateAnimationBlock,
    ],
  );

  const handleHistoryKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.metaKey && !event.ctrlKey) return;
    const key = event.key.toLowerCase();
    if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) engineActions.redoDocument();
      else engineActions.undoDocument();
    } else if (key === "y") {
      event.preventDefault();
      engineActions.redoDocument();
    }
  };

  const { scrollWidth: SCROLL_WIDTH } = calculateTimelineDimensions(tracks, 0);

  return (
    <div
      tabIndex={0}
      onKeyDown={handleHistoryKeyDown}
      className={cn(
        "relative z-20 flex h-96 shrink-0 flex-col border-t border-zinc-800 bg-zinc-950 shadow-[0_-8px_20px_rgba(0,0,0,0.5)] select-none",
      )}
    >
      <TimelineToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        isDirty={isDocumentDirty}
        onUndo={engineActions.undoDocument}
        onRedo={engineActions.redoDocument}
      />

      <div className="flex flex-1 overflow-hidden">
        <TimelineResourcePanel
          compileResult={compileResult}
          selectedPhaser={selectedPhaser}
          onSelectPhaser={timelineActions.setSelectedPhaser}
        />

        <TimelineTrackHeaders
          tracks={tracks}
          scrollRef={trackHeadersScrollRef}
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
              <TimelineGrid beatWidth={BEAT_WIDTH} viewport={viewport} />

              <div className="relative z-0 flex flex-col">
                {tracks.map((t) => (
                  <DroppableTrack
                    key={t.name}
                    track={t}
                    isExpanded={expandedTracks[t.name]}
                    selectedPhaser={selectedPhaser}
                    viewport={viewport}
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

              <TimelinePlayhead scrollRef={scrollRef} />
            </div>
          </div>
        </TimelineActionContext.Provider>
      </div>
    </div>
  );
};
