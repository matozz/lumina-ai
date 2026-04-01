import { useCallback, useEffect, useRef, useState } from "react";
import type { Easing, FromTo, FullDSL, TimelineEventDSL } from "@/bridge/types";
import { useEngineStore, engineActions, engineSelectors } from "@/stores/engine";
import { resolveOverlaps } from "../utils";
import { BEAT_WIDTH } from "../context/TimelineContext";

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

export const useTimelineEvents = () => {
  const parsedDsl = useEngineStore(engineSelectors.parsedDsl);
  const currentDslCode = useEngineStore(engineSelectors.currentDslCode);

  const [moving, setMoving] = useState<MovingState | null>(null);
  const [resizing, setResizing] = useState<ResizingState | null>(null);

  const interactionState = useRef<{ isInteracting: boolean }>({ isInteracting: false });

  const timelineEvents = parsedDsl?.timeline?.events || [];

  const addEvent = useCallback(
    (newEvent: TimelineEventDSL) => {
      try {
        const dslObj = JSON.parse(currentDslCode) as FullDSL;
        if (!dslObj.timeline) dslObj.timeline = { events: [] };
        if (!dslObj.timeline.events) dslObj.timeline.events = [];

        dslObj.timeline.events.push(newEvent);
        dslObj.timeline.events = resolveOverlaps(dslObj.timeline.events);
        engineActions.setCurrentDslCode(JSON.stringify(dslObj, null, 2));
      } catch (err) {
        console.error("Failed to update DSL", err);
      }
    },
    [currentDslCode],
  );

  const deleteEvent = useCallback(
    (originalIndex: number) => {
      try {
        const dslObj = JSON.parse(currentDslCode) as FullDSL;
        if (dslObj.timeline?.events) {
          dslObj.timeline.events.splice(originalIndex, 1);
          engineActions.setCurrentDslCode(JSON.stringify(dslObj, null, 2));
        }
      } catch (err) {}
    },
    [currentDslCode],
  );

  const updateAnimationBlock = useCallback(
    (eventIndex: number, fromValue: FromTo, toValue: FromTo, easing: string) => {
      try {
        const dslObj = JSON.parse(currentDslCode) as FullDSL;
        const ev = dslObj.timeline?.events?.[eventIndex];
        if (ev && ev.action.type === "animate") {
          ev.action.from = fromValue;
          ev.action.to = toValue;
          ev.action.easing = easing as Easing;

          engineActions.setCurrentDslCode(JSON.stringify(dslObj, null, 2));
        }
      } catch (err) {
        console.error("Failed to update animation block", err);
      }
    },
    [currentDslCode],
  );

  useEffect(() => {
    if (!resizing && !moving) return;

    const handlePointerMove = (e: PointerEvent) => {
      interactionState.current.isInteracting = true;

      if (resizing) {
        setResizing((prev) =>
          prev ? { ...prev, currentDeltaX: e.clientX - prev.startClientX } : null,
        );
      }

      if (moving) {
        let activeTrackName = moving.activeTrackName;
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        const trackEl = elements.find((el) => el.hasAttribute("data-track-name"));
        if (trackEl) {
          activeTrackName = trackEl.getAttribute("data-track-name") || undefined;
        }

        setMoving((prev) =>
          prev
            ? {
                ...prev,
                currentDeltaX: e.clientX - prev.startClientX,
                currentDeltaY: e.clientY - prev.startClientY,
                activeTrackName,
              }
            : null,
        );
      }
    };

    const handlePointerUp = () => {
      if (resizing) {
        const deltaBeats = resizing.currentDeltaX / BEAT_WIDTH;
        const newDuration = Math.max(
          0.5,
          Math.round((resizing.startDuration + deltaBeats) * 2) / 2,
        );

        try {
          const dslObj = JSON.parse(currentDslCode);
          if (dslObj.timeline?.events?.[resizing.originalIndex]) {
            if (dslObj.timeline.events[resizing.originalIndex].duration !== newDuration) {
              dslObj.timeline.events[resizing.originalIndex].duration = newDuration;
              dslObj.timeline.events = resolveOverlaps(dslObj.timeline.events);
              engineActions.setCurrentDslCode(JSON.stringify(dslObj, null, 2));
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

            if (ev.action.type === "animate") {
              if (ev.beat !== newBeat) {
                ev.beat = newBeat;
                dslObj.timeline.events = resolveOverlaps(dslObj.timeline.events);
                engineActions.setCurrentDslCode(JSON.stringify(dslObj, null, 2));
              }
            } else if (ev.action.type === "phaser") {
              // Extract the target phaser ID if dragging onto a specific track
              let targetPhaserId = ev.action.phaser;

              if (moving.activeTrackName?.startsWith("phaser:")) {
                targetPhaserId = moving.activeTrackName.replace("phaser:", "");
              }

              const isDifferentTrack = targetPhaserId !== ev.action.phaser;

              if (ev.beat !== newBeat || isDifferentTrack) {
                ev.beat = newBeat;
                ev.action.phaser = targetPhaserId;

                dslObj.timeline.events = resolveOverlaps(dslObj.timeline.events);
                engineActions.setCurrentDslCode(JSON.stringify(dslObj, null, 2));
              }
            }
          }
        } catch (err) {}
      }

      setResizing(null);
      setMoving(null);

      setTimeout(() => {
        interactionState.current.isInteracting = false;
      }, 50);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [resizing, moving, currentDslCode]);

  return {
    timelineEvents,
    moving,
    setMoving,
    resizing,
    setResizing,
    interactionState,
    addEvent,
    deleteEvent,
    updateAnimationBlock,
  };
};
