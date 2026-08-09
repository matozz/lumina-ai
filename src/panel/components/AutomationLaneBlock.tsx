import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { KeyframeInterpolationDSL } from "@/bridge/types";
import { engineSelectors, useEngineStore } from "@/stores/engine";
import { resolveAutomationParameter } from "../automationParameters";
import { isTextEditingTarget } from "@/lib/dom";
import { parameterAutomation } from "@/document/effectParameter";
import { useTimelineActions } from "../context/TimelineContext";
import { clampKeyframeDelta, keyframeMoveBounds, keyframeTransform } from "../keyframeGeometry";
import {
  pointerDeltaWithScroll,
  snappedTickForPointerDelta,
  ticksToPixels,
  type TimelineGeometry,
} from "../timelineGeometry";
import type { UITimelineEvent } from "../types";
import type { TimelineViewport } from "../virtualization";
import { AutomationCurveSegment } from "./AutomationCurveSegment";
import { AutomationKeyframeControl } from "./AutomationKeyframeControl";
import { AutomationLaneAddButton } from "./AutomationLaneAddButton";

interface AutomationLaneBlockProps {
  event: UITimelineEvent;
  viewport: TimelineViewport;
}

interface KeyframeMoveInteraction {
  bounds: ReturnType<typeof keyframeMoveBounds>;
  anchorTick: number;
  currentClientX: number;
  deltaTick: number;
  geometry: TimelineGeometry;
  keyframeIds: string[];
  laneId: string;
  scrollElement: HTMLElement | null;
  startClientX: number;
  startScrollLeft: number;
  trackId: string;
}

interface BoxInteraction {
  currentX: number;
  startX: number;
}

export const AutomationLaneBlock = memo(({ event, viewport }: AutomationLaneBlockProps) => {
  const document = useEngineStore(engineSelectors.parsedDsl);
  const actions = useTimelineActions();
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const rowRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const keyframeRefs = useRef(new Map<string, HTMLElement>());
  const moveInteraction = useRef<KeyframeMoveInteraction | null>(null);
  const boxInteraction = useRef<BoxInteraction | null>(null);
  const animationFrame = useRef<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [inspectorId, setInspectorId] = useState<string | null>(null);

  const source = useMemo(() => {
    if (!document?.timeline || !event.source_track_id || !event.source_item_id) return undefined;
    const track = document.timeline.tracks.find(
      (candidate) => candidate.id === event.source_track_id,
    );
    const lane = track?.automation_lanes?.find(
      (candidate) => candidate.id === event.source_item_id,
    );
    if (!track || !lane) return undefined;
    const parameter = resolveAutomationParameter(document, lane.target);
    return parameter ? { track, lane, parameter } : undefined;
  }, [document, event.source_item_id, event.source_track_id]);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    if (!source) return;
    const existing = new Set(source.lane.keyframes.map((keyframe) => keyframe.id));
    setSelectedIds((current) => {
      const retained = new Set(Array.from(current).filter((id) => existing.has(id)));
      return retained.size === current.size ? current : retained;
    });
    if (inspectorId && !existing.has(inspectorId)) setInspectorId(null);
  }, [inspectorId, source]);

  useEffect(() => {
    const resetMovePreview = () => {
      const active = moveInteraction.current;
      if (!active) return;
      for (const id of active.keyframeIds) {
        const element = keyframeRefs.current.get(id);
        if (element) element.style.transform = keyframeTransform(0);
      }
    };
    const resetMarquee = () => {
      if (marqueeRef.current) marqueeRef.current.style.display = "none";
    };

    const applyPointerPreview = () => {
      const moving = moveInteraction.current;
      const currentSource = sourceRef.current;
      if (moving && currentSource) {
        const deltaPixels = pointerDeltaWithScroll(
          moving.startClientX,
          moving.currentClientX,
          moving.startScrollLeft,
          moving.scrollElement?.scrollLeft ?? moving.startScrollLeft,
        );
        const snappedTick = snappedTickForPointerDelta(
          moving.anchorTick,
          deltaPixels,
          moving.geometry,
        );
        const rawDelta = snappedTick - moving.anchorTick;
        moving.deltaTick = clampKeyframeDelta(rawDelta, moving.bounds);
        const translateX = ticksToPixels(moving.deltaTick, moving.geometry);
        for (const id of moving.keyframeIds) {
          const element = keyframeRefs.current.get(id);
          if (element) element.style.transform = keyframeTransform(translateX);
        }
        actionsRef.current.onSnapPreview(moving.anchorTick + moving.deltaTick);
        return;
      }

      const boxing = boxInteraction.current;
      if (!boxing || !marqueeRef.current) return;
      const left = Math.min(boxing.startX, boxing.currentX);
      marqueeRef.current.style.display = "block";
      marqueeRef.current.style.left = `${left}px`;
      marqueeRef.current.style.width = `${Math.abs(boxing.currentX - boxing.startX)}px`;
    };

    const flushPointerPreview = () => {
      animationFrame.current = null;
      applyPointerPreview();
    };

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const moving = moveInteraction.current;
      if (moving) moving.currentClientX = pointerEvent.clientX;
      const boxing = boxInteraction.current;
      const row = rowRef.current;
      if (boxing && row) boxing.currentX = pointerEvent.clientX - row.getBoundingClientRect().left;
      if ((moving || boxing) && animationFrame.current === null) {
        animationFrame.current = globalThis.requestAnimationFrame(flushPointerPreview);
      }
    };

    const finishPointerInteraction = (commit: boolean) => {
      if (animationFrame.current !== null) {
        globalThis.cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
        applyPointerPreview();
      }
      const moving = moveInteraction.current;
      if (moving) {
        resetMovePreview();
        moveInteraction.current = null;
        actionsRef.current.onSnapPreviewEnd();
        if (commit && moving.deltaTick !== 0) {
          actionsRef.current.onMoveKeyframes(
            moving.trackId,
            moving.laneId,
            moving.keyframeIds,
            moving.deltaTick,
          );
        }
      }

      const boxing = boxInteraction.current;
      const currentSource = sourceRef.current;
      const ppq = document?.timeline?.ppq;
      if (boxing && currentSource && ppq && commit) {
        const firstTick = Math.round(
          (Math.min(boxing.startX, boxing.currentX) / actionsRef.current.geometry.beatWidth) * ppq,
        );
        const lastTick = Math.round(
          (Math.max(boxing.startX, boxing.currentX) / actionsRef.current.geometry.beatWidth) * ppq,
        );
        setSelectedIds(
          new Set(
            currentSource.lane.keyframes
              .filter(
                (keyframe) => keyframe.time_tick >= firstTick && keyframe.time_tick <= lastTick,
              )
              .map((keyframe) => keyframe.id),
          ),
        );
      }
      boxInteraction.current = null;
      resetMarquee();
    };

    const handlePointerUp = () => finishPointerInteraction(true);
    const handlePointerCancel = () => finishPointerInteraction(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (moveInteraction.current || boxInteraction.current)) {
        event.preventDefault();
        finishPointerInteraction(false);
      }
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      if (animationFrame.current !== null) globalThis.cancelAnimationFrame(animationFrame.current);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [document?.timeline]);

  if (!source || !document?.timeline) return null;
  const { track, lane, parameter } = source;
  const { ppq, tempo_map: tempoMap } = document.timeline;
  const visibleKeyframes = lane.keyframes.filter(
    (keyframe) =>
      keyframe.time_tick / ppq >= viewport.startBeat - 1 &&
      keyframe.time_tick / ppq <= viewport.endBeat + 1,
  );
  const visibleSegments = lane.keyframes.slice(0, -1).filter((keyframe, index) => {
    const next = lane.keyframes[index + 1];
    return (
      next.time_tick / ppq >= viewport.startBeat && keyframe.time_tick / ppq <= viewport.endBeat
    );
  });

  const deleteSelected = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || ids.length >= lane.keyframes.length) return;
    actions.onDeleteKeyframes(track.id, lane.id, ids);
    setSelectedIds(new Set());
    setInspectorId(null);
  };
  const moveSelectedBy = (deltaTick: number) => {
    if (selectedIds.size === 0) return;
    const bounds = keyframeMoveBounds(lane.keyframes, selectedIds);
    const clamped = clampKeyframeDelta(deltaTick, bounds);
    if (clamped !== 0) {
      actions.onMoveKeyframes(track.id, lane.id, Array.from(selectedIds), clamped);
    }
  };
  const addAtTick = (requestedTick: number) => {
    const step = Math.max(1, Math.round(ppq / 4));
    let timeTick = Math.max(0, Math.min(0xffff_ffff, requestedTick));
    const occupied = new Set(lane.keyframes.map((keyframe) => keyframe.time_tick));
    while (occupied.has(timeTick) && timeTick <= 0xffff_ffff - step) timeTick += step;
    if (occupied.has(timeTick)) return;
    const previous = [...lane.keyframes]
      .reverse()
      .find((keyframe) => keyframe.time_tick < timeTick);
    const value = structuredClone(previous?.value ?? parameter.initialValue);
    const interpolation: KeyframeInterpolationDSL =
      parameterAutomation(parameter.definition) === "discrete" ? "hold" : "linear";
    actions.onAddKeyframe(track.id, lane.id, timeTick, value, interpolation);
  };

  return (
    <div
      ref={rowRef}
      className="group/lane focus-visible:ring-ring absolute inset-0 focus-visible:ring-2 focus-visible:outline-none"
      role="group"
      tabIndex={0}
      aria-label={`${parameter.definition.name} automation lane with ${lane.keyframes.length} keyframes`}
      data-lane-id={lane.id}
      onPointerDown={(pointerEvent) => {
        if (pointerEvent.button !== 0) return;
        const row = rowRef.current;
        if (!row) return;
        pointerEvent.preventDefault();
        row.focus();
        const startX = pointerEvent.clientX - row.getBoundingClientRect().left;
        boxInteraction.current = { startX, currentX: startX };
      }}
      onDoubleClick={(mouseEvent) => {
        const row = rowRef.current;
        if (!row) return;
        mouseEvent.preventDefault();
        const x = mouseEvent.clientX - row.getBoundingClientRect().left;
        const step = Math.max(1, Math.round(ppq / 4));
        addAtTick(Math.round(((x / actions.geometry.beatWidth) * ppq) / step) * step);
      }}
      onKeyDown={(keyboardEvent) => {
        if (isTextEditingTarget(keyboardEvent.target)) return;
        if ((keyboardEvent.metaKey || keyboardEvent.ctrlKey) && keyboardEvent.key === "a") {
          keyboardEvent.preventDefault();
          setSelectedIds(new Set(lane.keyframes.map((keyframe) => keyframe.id)));
        } else if (keyboardEvent.key === "Delete" || keyboardEvent.key === "Backspace") {
          keyboardEvent.preventDefault();
          deleteSelected();
        } else if (keyboardEvent.key === "ArrowLeft" || keyboardEvent.key === "ArrowRight") {
          keyboardEvent.preventDefault();
          const direction = keyboardEvent.key === "ArrowLeft" ? -1 : 1;
          moveSelectedBy(direction * (keyboardEvent.shiftKey ? ppq : Math.round(ppq / 4)));
        } else if (keyboardEvent.key === "Enter" && selectedIds.size === 0) {
          keyboardEvent.preventDefault();
          addAtTick(Math.round(useEngineStore.getState().globalBeat * ppq));
        }
      }}
    >
      {visibleSegments.map((keyframe) => {
        const index = lane.keyframes.findIndex((candidate) => candidate.id === keyframe.id);
        const next = lane.keyframes[index + 1];
        return (
          <AutomationCurveSegment
            key={`${keyframe.id}:${next.id}`}
            start={keyframe}
            end={next}
            definition={parameter.definition}
            ppq={ppq}
            beatWidth={actions.geometry.beatWidth}
          />
        );
      })}

      {visibleKeyframes.map((keyframe) => {
        return (
          <AutomationKeyframeControl
            key={keyframe.id}
            actions={actions}
            definition={parameter.definition}
            inspectorOpen={inspectorId === keyframe.id}
            keyframe={keyframe}
            keyframes={lane.keyframes}
            laneId={lane.id}
            onElement={(element) => {
              if (element) keyframeRefs.current.set(keyframe.id, element);
              else keyframeRefs.current.delete(keyframe.id);
            }}
            onInspectorOpenChange={(open) => setInspectorId(open ? keyframe.id : null)}
            onSelectionChange={setSelectedIds}
            onStartMove={(pointerEvent, selection) => {
              const scrollElement =
                pointerEvent.currentTarget.closest<HTMLElement>("[data-timeline-scroll]");
              moveInteraction.current = {
                bounds: keyframeMoveBounds(lane.keyframes, selection),
                anchorTick: keyframe.time_tick,
                currentClientX: pointerEvent.clientX,
                deltaTick: 0,
                geometry: actions.geometry,
                keyframeIds: Array.from(selection),
                laneId: lane.id,
                scrollElement,
                startClientX: pointerEvent.clientX,
                startScrollLeft: scrollElement?.scrollLeft ?? 0,
                trackId: track.id,
              };
            }}
            beatWidth={actions.geometry.beatWidth}
            ppq={ppq}
            selectedIds={selectedIds}
            tempoMap={tempoMap}
            trackId={track.id}
          />
        );
      })}

      <AutomationLaneAddButton
        definitionName={parameter.definition.name}
        viewport={viewport}
        beatWidth={actions.geometry.beatWidth}
        onAdd={() => addAtTick(Math.round(useEngineStore.getState().globalBeat * ppq))}
      />

      <div
        ref={marqueeRef}
        className="border-primary bg-primary/10 pointer-events-none absolute top-0 bottom-0 z-20 hidden border"
      />
    </div>
  );
});

AutomationLaneBlock.displayName = "AutomationLaneBlock";
