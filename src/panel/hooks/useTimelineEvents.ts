import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AutomationLaneDSL,
  Easing,
  FromTo,
  FullDSL,
  ParameterValueDSL,
  TimelineEventDSL,
  TimelineTrackDSL,
} from "@/bridge/types";
import { useEngineStore, engineActions, engineSelectors } from "@/stores/engine";
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

  const timelineEvents = useMemo(() => flattenTimeline(parsedDsl), [parsedDsl]);

  const addEvent = useCallback(
    (newEvent: TimelineEventDSL) => {
      try {
        const dslObj = JSON.parse(currentDslCode) as FullDSL;
        if (!dslObj.timeline) {
          dslObj.timeline = {
            ppq: 960,
            tempo_map: { points: [{ time_tick: 0, bpm: 120 }] },
            tracks: [],
          };
        }
        if (newEvent.action.type !== "effect") return;
        let track = dslObj.timeline.tracks.find((candidate) => candidate.id === "effects");
        if (!track) {
          track = {
            id: "effects",
            name: "Effects",
            overlap_policy: "layer",
            clips: [],
            automation_lanes: [],
          };
          dslObj.timeline.tracks.push(track);
        }
        track.clips ??= [];
        track.clips.push({
          id: stableId("clip"),
          instance_id: newEvent.action.instance_id,
          start_tick: beatsToTicks(newEvent.beat, dslObj.timeline.ppq),
          duration_tick: Math.max(1, beatsToTicks(newEvent.duration ?? 4, dslObj.timeline.ppq)),
          source_offset_tick: 0,
          playback: "once",
          layer: nextLayer(track),
        });
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
        const view = timelineEvents[originalIndex];
        if (!dslObj.timeline || !view?.source_track_id || !view.source_item_id) return;
        const track = dslObj.timeline.tracks.find((item) => item.id === view.source_track_id);
        if (!track) return;
        if (view.action.type === "effect") {
          track.clips = (track.clips ?? []).filter((clip) => clip.id !== view.source_item_id);
        } else {
          track.automation_lanes = (track.automation_lanes ?? []).filter(
            (lane) => lane.id !== view.source_item_id,
          );
        }
        engineActions.setCurrentDslCode(JSON.stringify(dslObj, null, 2));
      } catch {}
    },
    [currentDslCode, timelineEvents],
  );

  const updateAnimationBlock = useCallback(
    (eventIndex: number, fromValue: FromTo, toValue: FromTo, easing: string) => {
      try {
        const dslObj = JSON.parse(currentDslCode) as FullDSL;
        const view = timelineEvents[eventIndex];
        const lane = findLane(dslObj, view);
        if (!lane || lane.keyframes.length === 0) return;
        lane.keyframes[0].value = toParameterValue(fromValue, lane.keyframes[0].value);
        lane.keyframes[0].interpolation = easing as Easing;
        const last = lane.keyframes[lane.keyframes.length - 1];
        if (last) last.value = toParameterValue(toValue, last.value);
        engineActions.setCurrentDslCode(JSON.stringify(dslObj, null, 2));
      } catch (err) {
        console.error("Failed to update animation block", err);
      }
    },
    [currentDslCode, timelineEvents],
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
          const dslObj = JSON.parse(currentDslCode) as FullDSL;
          const view = timelineEvents[resizing.originalIndex];
          if (dslObj.timeline && view) {
            const durationTick = Math.max(1, beatsToTicks(newDuration, dslObj.timeline.ppq));
            const clip = findClip(dslObj, view);
            if (clip) clip.duration_tick = durationTick;
            const lane = findLane(dslObj, view);
            if (lane && lane.keyframes.length > 1) {
              const start = lane.keyframes[0].time_tick;
              const oldDuration = Math.max(
                1,
                lane.keyframes[lane.keyframes.length - 1].time_tick - start,
              );
              for (const keyframe of lane.keyframes.slice(1)) {
                keyframe.time_tick =
                  start + Math.round(((keyframe.time_tick - start) / oldDuration) * durationTick);
              }
            }
            if (clip || lane) engineActions.setCurrentDslCode(JSON.stringify(dslObj, null, 2));
          }
        } catch {}
      }

      if (moving) {
        const deltaBeats = moving.currentDeltaX / BEAT_WIDTH;
        const newBeat = Math.max(0, Math.floor((moving.startBeat + deltaBeats) * 2) / 2);

        try {
          const dslObj = JSON.parse(currentDslCode) as FullDSL;
          const view = timelineEvents[moving.originalIndex];
          if (dslObj.timeline && view) {
            const newTick = beatsToTicks(newBeat, dslObj.timeline.ppq);
            const clip = findClip(dslObj, view);
            if (clip) {
              clip.start_tick = newTick;
              if (moving.activeTrackName?.startsWith("phaser:")) {
                clip.instance_id = moving.activeTrackName.replace("phaser:", "");
              }
            }
            const lane = findLane(dslObj, view);
            if (lane && lane.keyframes.length > 0) {
              const delta = newTick - lane.keyframes[0].time_tick;
              for (const keyframe of lane.keyframes) {
                keyframe.time_tick = Math.max(0, keyframe.time_tick + delta);
              }
            }
            if (clip || lane) engineActions.setCurrentDslCode(JSON.stringify(dslObj, null, 2));
          }
        } catch {}
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
  }, [resizing, moving, currentDslCode, timelineEvents]);

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

function flattenTimeline(document: FullDSL | null): TimelineEventDSL[] {
  const timeline = document?.timeline;
  if (!timeline) return [];
  const events: TimelineEventDSL[] = [];
  for (const track of timeline.tracks) {
    for (const clip of track.clips ?? []) {
      events.push({
        id: clip.id,
        beat: clip.start_tick / timeline.ppq,
        duration: clip.duration_tick / timeline.ppq,
        action: { type: "effect", instance_id: clip.instance_id },
        source_track_id: track.id,
        source_item_id: clip.id,
      });
    }
    for (const lane of track.automation_lanes ?? []) {
      const first = lane.keyframes[0];
      const last = lane.keyframes[lane.keyframes.length - 1];
      if (!first || !last) continue;
      events.push({
        id: lane.id,
        beat: first.time_tick / timeline.ppq,
        duration: Math.max(1, last.time_tick - first.time_tick) / timeline.ppq,
        action: {
          type: "animate",
          target: lane.target,
          from: fromParameterValue(first.value),
          to: fromParameterValue(last.value),
          easing: first.interpolation,
        },
        source_track_id: track.id,
        source_item_id: lane.id,
      });
    }
  }
  return events.sort(
    (left, right) => left.beat - right.beat || (left.id ?? "").localeCompare(right.id ?? ""),
  );
}

function findClip(document: FullDSL, view?: TimelineEventDSL) {
  if (!view?.source_track_id || !view.source_item_id) return undefined;
  return document.timeline?.tracks
    .find((track) => track.id === view.source_track_id)
    ?.clips?.find((clip) => clip.id === view.source_item_id);
}

function findLane(document: FullDSL, view?: TimelineEventDSL): AutomationLaneDSL | undefined {
  if (!view?.source_track_id || !view.source_item_id) return undefined;
  return document.timeline?.tracks
    .find((track) => track.id === view.source_track_id)
    ?.automation_lanes?.find((lane) => lane.id === view.source_item_id);
}

function beatsToTicks(beats: number, ppq: number) {
  return Math.max(0, Math.round(beats * ppq));
}

function nextLayer(track: TimelineTrackDSL) {
  return (track.clips ?? []).reduce((maximum, clip) => Math.max(maximum, clip.layer ?? 0), -1) + 1;
}

function stableId(prefix: string) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function fromParameterValue(value: ParameterValueDSL): FromTo {
  return value.value;
}

function toParameterValue(value: FromTo, previous: ParameterValueDSL): ParameterValueDSL {
  if (previous.type === "color") return { type: "color", value: String(value) };
  if (previous.type === "direction") {
    return { type: "direction", value: value === "reverse" ? "reverse" : "forward" };
  }
  return { type: "scalar", value: Number(value) };
}
