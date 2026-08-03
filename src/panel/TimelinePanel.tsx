import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { engine } from "@/bridge/commands";
import { useEngineStore, engineActions, engineSelectors } from "@/stores/engine";
import { useTimelineStore, timelineActions, timelineSelectors } from "@/stores/timeline";
import { workspaceActions } from "@/stores/workspace";
import { cn } from "@/lib/utils";
import { isTextEditingTarget } from "@/lib/dom";
import { useTimelineEvents } from "./hooks/useTimelineEvents";
import { useTimelineTracks } from "./hooks/useTimelineTracks";
import { TimelineActionContext } from "./context/TimelineContext";
import { calculateTimelineDimensions } from "./utils";
import { viewportFromScroll, type TimelineViewport } from "./virtualization";
import { BEAT_WIDTH_STEP, clampBeatWidth, pixelsToTicks, snapTick } from "./timelineGeometry";
import {
  TimelineToolbar,
  TimelineResourcePanel,
  TimelineTrackHeaders,
  TimelineGrid,
  DroppableTrack,
  TimelinePlayhead,
} from "./components";

interface TimelinePanelProps {
  embedded?: boolean;
}

export const TimelinePanel = ({ embedded = false }: TimelinePanelProps) => {
  const canUndo = useEngineStore(engineSelectors.canUndo);
  const canRedo = useEngineStore(engineSelectors.canRedo);
  const isDocumentDirty = useEngineStore(engineSelectors.isDocumentDirty);

  const selectedPhaser = useTimelineStore(timelineSelectors.selectedPhaser);
  const expandedTracks = useTimelineStore(timelineSelectors.expandedTracks);
  const beatWidth = useTimelineStore(timelineSelectors.beatWidth);

  const scrollRef = useRef<HTMLDivElement>(null);
  const trackHeadersScrollRef = useRef<HTMLDivElement>(null);
  const seekSequenceRef = useRef(0);
  const [viewport, setViewport] = useState<TimelineViewport>({
    startBeat: 0,
    endBeat: 40,
    visibleStartBeat: 0,
    visibleEndBeat: 32,
  });

  const {
    document,
    geometry,
    timelineEvents,
    interactionState,
    snapGuideRef,
    showSnapPreview,
    hideSnapPreview,
    startMoving,
    startResizing,
    addEvent,
    addAutomationLane,
    deleteEvent,
    nudgeEvent,
    resizeEventBy,
    trimClipOverlaps,
    replaceClipOverlaps,
    addKeyframe,
    moveKeyframes,
    deleteKeyframes,
    updateKeyframe,
  } = useTimelineEvents({ beatWidth, scrollRef });

  const tracks = useTimelineTracks(timelineEvents, document);

  const updateViewport = useCallback(
    (container: HTMLDivElement) => {
      const next = viewportFromScroll(container.scrollLeft, container.clientWidth, beatWidth);
      setViewport((current) =>
        current.startBeat === next.startBeat &&
        current.endBeat === next.endBeat &&
        current.visibleStartBeat === next.visibleStartBeat &&
        current.visibleEndBeat === next.visibleEndBeat
          ? current
          : next,
      );
    },
    [beatWidth],
  );

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
    if (
      selectedPhaser &&
      !document?.effect_instances.some((instance) => instance.id === selectedPhaser)
    ) {
      timelineActions.setSelectedPhaser(null);
    }
  }, [document?.effect_instances, selectedPhaser]);

  const placeEffect = useCallback(
    (instanceId: string, clientX: number) => {
      if (!document?.effect_instances.some((instance) => instance.id === instanceId)) {
        workspaceActions.setPublishStatus(
          "error",
          "That effect revision is no longer available. Select it again from the library.",
        );
        return;
      }
      const container = scrollRef.current;
      if (!container) return;
      const x = clientX - container.getBoundingClientRect().left + container.scrollLeft;
      const snappedTick = snapTick(pixelsToTicks(x, geometry), geometry);
      try {
        addEvent({
          beat: snappedTick / geometry.ppq,
          duration: 4,
          action: { type: "effect", instance_id: instanceId },
        });
        workspaceActions.setPublishStatus(
          "idle",
          `Placed effect at beat ${snappedTick / geometry.ppq}.`,
        );
      } catch (error) {
        workspaceActions.setPublishStatus(
          "error",
          error instanceof Error ? error.message : "Effect could not be placed.",
        );
      }
    },
    [addEvent, document?.effect_instances, geometry],
  );

  const handleGridClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, _trackName: string) => {
      if (interactionState.current.isInteracting) return;
      if (!selectedPhaser) return;

      placeEffect(selectedPhaser, e.clientX);
    },
    [interactionState, placeEffect, selectedPhaser],
  );

  const handleEffectDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const instanceId = event.dataTransfer.getData("application/x-lumina-effect-instance");
      if (!instanceId) return;
      event.preventDefault();
      placeEffect(instanceId, event.clientX);
    },
    [placeEffect],
  );

  const handleZoom = useCallback(
    (requestedBeatWidth: number) => {
      const nextBeatWidth = clampBeatWidth(requestedBeatWidth);
      const container = scrollRef.current;
      const centerBeat = container
        ? (container.scrollLeft + container.clientWidth / 2) / beatWidth
        : 0;
      timelineActions.setBeatWidth(nextBeatWidth);
      globalThis.requestAnimationFrame(() => {
        if (!container) return;
        container.scrollLeft = Math.max(0, centerBeat * nextBeatWidth - container.clientWidth / 2);
        updateViewport(container);
      });
    },
    [beatWidth, updateViewport],
  );

  const handleSeek = useCallback((beat: number) => {
    const previousBeat = useEngineStore.getState().globalBeat;
    const sequence = ++seekSequenceRef.current;
    engineActions.setGlobalBeat(beat);
    void engine
      .seek(beat)
      .then(() => {
        if (seekSequenceRef.current === sequence) {
          workspaceActions.setPublishStatus("idle", `Seeked to beat ${beat}.`);
        }
      })
      .catch((error) => {
        if (seekSequenceRef.current !== sequence) return;
        engineActions.setGlobalBeat(previousBeat);
        workspaceActions.setPublishStatus(
          "error",
          error instanceof Error ? error.message : "Timeline seek failed.",
        );
      });
  }, []);

  const timelineActionsValue = useMemo(
    () => ({
      geometry,
      onDragStart: (e: React.PointerEvent, originalIndex: number, element: HTMLElement) => {
        startMoving(
          originalIndex,
          e.clientX,
          e.clientY,
          tracks.find((track) =>
            track.events.some((event) => event.originalIndex === originalIndex),
          )?.id,
          element,
        );
      },
      onResizeStart: (e: React.PointerEvent, originalIndex: number, element: HTMLElement) =>
        startResizing(originalIndex, e.clientX, element),
      onDelete: deleteEvent,
      onNudge: nudgeEvent,
      onResizeBy: resizeEventBy,
      onTrimClipOverlaps: trimClipOverlaps,
      onReplaceClipOverlaps: replaceClipOverlaps,
      onAddKeyframe: addKeyframe,
      onMoveKeyframes: moveKeyframes,
      onDeleteKeyframes: deleteKeyframes,
      onUpdateKeyframe: updateKeyframe,
      onGridClick: handleGridClick,
      onDropEffect: handleEffectDrop,
      onSnapPreview: showSnapPreview,
      onSnapPreviewEnd: hideSnapPreview,
    }),
    [
      deleteEvent,
      deleteKeyframes,
      handleGridClick,
      handleEffectDrop,
      geometry,
      hideSnapPreview,
      addKeyframe,
      moveKeyframes,
      nudgeEvent,
      replaceClipOverlaps,
      resizeEventBy,
      showSnapPreview,
      startMoving,
      startResizing,
      tracks,
      trimClipOverlaps,
      updateKeyframe,
    ],
  );

  const handleHistoryKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTextEditingTarget(event.target)) return;
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

  const { scrollWidth: SCROLL_WIDTH } = calculateTimelineDimensions(tracks, 0, beatWidth);

  return (
    <div
      tabIndex={0}
      onKeyDown={handleHistoryKeyDown}
      className={cn(
        "relative z-20 flex min-h-0 min-w-0 flex-col bg-zinc-950 select-none",
        embedded
          ? "h-full border-0 shadow-none"
          : "h-[clamp(18rem,40vh,24rem)] shrink-0 border-t border-zinc-800 shadow-[0_-8px_20px_rgba(0,0,0,0.5)]",
      )}
      data-layout-region="timeline"
    >
      <TimelineToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        isDirty={isDocumentDirty}
        onUndo={engineActions.undoDocument}
        onRedo={engineActions.redoDocument}
        beatWidth={beatWidth}
        snapBeats={geometry.snapTicks / geometry.ppq}
        onZoomIn={() => handleZoom(beatWidth + BEAT_WIDTH_STEP)}
        onZoomOut={() => handleZoom(beatWidth - BEAT_WIDTH_STEP)}
      />

      {embedded && (
        <div className="flex h-7 shrink-0 items-center border-b border-zinc-800 bg-cyan-950/20 px-3 text-[10px] text-cyan-200/70">
          <span className="font-medium">FIXED BPM ARRANGEMENT</span>
          <span className="ml-2">Lighting clips and automation share the same tick grid</span>
          <span className="ml-auto font-mono">Stage 6</span>
        </div>
      )}

      <div className={cn("flex min-h-0 min-w-0 flex-1 overflow-hidden")}>
        <TimelineResourcePanel
          document={document}
          selectedPhaser={selectedPhaser}
          onSelectPhaser={timelineActions.setSelectedPhaser}
        />

        <TimelineTrackHeaders
          tracks={tracks}
          scrollRef={trackHeadersScrollRef}
          expandedTracks={expandedTracks}
          setExpandedTracks={timelineActions.setExpandedTracks}
          document={document}
          onAddAutomationLane={addAutomationLane}
        />

        <TimelineActionContext.Provider value={timelineActionsValue}>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            data-timeline-scroll
            className={cn(
              "custom-scrollbar relative min-w-0 flex-1 overflow-x-auto overflow-y-auto overscroll-none bg-[#0a0a0c]",
            )}
          >
            <div style={{ width: SCROLL_WIDTH, height: "100%", position: "relative" }}>
              <TimelineGrid
                geometry={geometry}
                viewport={viewport}
                maxBeat={SCROLL_WIDTH / beatWidth}
                onSeek={handleSeek}
              />

              <div className="relative z-0 flex flex-col">
                {tracks.map((t) => (
                  <DroppableTrack
                    key={t.name}
                    track={t}
                    isExpanded={expandedTracks[t.name]}
                    selectedPhaser={selectedPhaser}
                    viewport={viewport}
                    beatWidth={beatWidth}
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

              <div
                ref={snapGuideRef}
                className="pointer-events-none absolute top-0 bottom-0 z-30 hidden w-px bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.75)]"
                aria-hidden="true"
                data-testid="timeline-snap-guide"
              >
                <span
                  data-snap-label
                  className="absolute top-1 left-1 rounded bg-amber-300 px-1 py-0.5 font-mono text-[9px] whitespace-nowrap text-black"
                />
              </div>

              <TimelinePlayhead beatWidth={beatWidth} scrollRef={scrollRef} />
            </div>
          </div>
        </TimelineActionContext.Provider>
      </div>
    </div>
  );
};
