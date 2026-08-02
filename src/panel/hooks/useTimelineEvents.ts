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
import type { DocumentCommand, DocumentTransaction } from "@/document/commands";
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

  const [moving, setMoving] = useState<MovingState | null>(null);
  const [resizing, setResizing] = useState<ResizingState | null>(null);

  const interactionState = useRef<{ isInteracting: boolean }>({ isInteracting: false });

  const timelineEvents = useMemo(() => flattenTimeline(parsedDsl), [parsedDsl]);

  const addEvent = useCallback(
    (newEvent: TimelineEventDSL) => {
      if (!parsedDsl || newEvent.action.type !== "effect") return;
      const ppq = parsedDsl.timeline?.ppq ?? 960;
      const track = parsedDsl.timeline?.tracks.find((candidate) => candidate.id === "effects");
      engineActions.applyDocumentTransaction(
        transaction("Add EffectClip", {
          type: "add_clip",
          track_id: "effects",
          track_name: "Effects",
          clip: {
            id: stableId("clip"),
            instance_id: newEvent.action.instance_id,
            start_tick: beatsToTicks(newEvent.beat, ppq),
            duration_tick: Math.max(1, beatsToTicks(newEvent.duration ?? 4, ppq)),
            source_offset_tick: 0,
            playback: "once",
            layer: track ? nextLayer(track) : 0,
          },
        }),
      );
    },
    [parsedDsl],
  );

  const deleteEvent = useCallback(
    (originalIndex: number) => {
      const view = timelineEvents[originalIndex];
      if (!view?.source_track_id || !view.source_item_id) return;
      const command: DocumentCommand =
        view.action.type === "effect"
          ? {
              type: "delete_clip",
              track_id: view.source_track_id,
              clip_id: view.source_item_id,
            }
          : {
              type: "delete_automation_lane",
              track_id: view.source_track_id,
              lane_id: view.source_item_id,
            };
      engineActions.applyDocumentTransaction(transaction("Delete timeline item", command));
    },
    [timelineEvents],
  );

  const updateAnimationBlock = useCallback(
    (eventIndex: number, fromValue: FromTo, toValue: FromTo, easing: string) => {
      if (!parsedDsl) return;
      const view = timelineEvents[eventIndex];
      const lane = findLane(parsedDsl, view);
      if (!lane || lane.keyframes.length === 0 || !view.source_track_id) return;
      const nextLane = structuredClone(lane);
      nextLane.keyframes[0].value = toParameterValue(fromValue, nextLane.keyframes[0].value);
      nextLane.keyframes[0].interpolation = easing as Easing;
      const last = nextLane.keyframes[nextLane.keyframes.length - 1];
      if (last) last.value = toParameterValue(toValue, last.value);
      engineActions.applyDocumentTransaction(
        transaction("Update AutomationLane", {
          type: "replace_automation_lane",
          track_id: view.source_track_id,
          lane_id: nextLane.id,
          lane: nextLane,
        }),
      );
    },
    [parsedDsl, timelineEvents],
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

        const view = timelineEvents[resizing.originalIndex];
        if (parsedDsl?.timeline && view?.source_track_id && view.source_item_id) {
          const durationTick = Math.max(1, beatsToTicks(newDuration, parsedDsl.timeline.ppq));
          const command: DocumentCommand =
            view.action.type === "effect"
              ? {
                  type: "resize_clip",
                  track_id: view.source_track_id,
                  clip_id: view.source_item_id,
                  duration_tick: durationTick,
                }
              : {
                  type: "scale_automation_lane",
                  track_id: view.source_track_id,
                  lane_id: view.source_item_id,
                  start_tick: beatsToTicks(view.beat, parsedDsl.timeline.ppq),
                  duration_tick: durationTick,
                };
          engineActions.applyDocumentTransaction(transaction("Resize timeline item", command));
        }
      }

      if (moving) {
        const deltaBeats = moving.currentDeltaX / BEAT_WIDTH;
        const newBeat = Math.max(0, Math.floor((moving.startBeat + deltaBeats) * 2) / 2);

        const view = timelineEvents[moving.originalIndex];
        if (parsedDsl?.timeline && view?.source_track_id && view.source_item_id) {
          const newTick = beatsToTicks(newBeat, parsedDsl.timeline.ppq);
          const clip = findClip(parsedDsl, view);
          const lane = findLane(parsedDsl, view);
          let command: DocumentCommand | undefined;
          if (clip) {
            command = {
              type: "move_clip",
              track_id: view.source_track_id,
              clip_id: view.source_item_id,
              start_tick: newTick,
              instance_id: moving.activeTrackName?.startsWith("phaser:")
                ? moving.activeTrackName.replace("phaser:", "")
                : undefined,
            };
          } else if (lane && lane.keyframes.length > 0) {
            command = {
              type: "move_automation_lane",
              track_id: view.source_track_id,
              lane_id: view.source_item_id,
              delta_tick: newTick - lane.keyframes[0].time_tick,
            };
          }
          if (command) {
            engineActions.applyDocumentTransaction(transaction("Move timeline item", command));
          }
        }
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
  }, [resizing, moving, parsedDsl, timelineEvents]);

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

function transaction(label: string, ...commands: DocumentCommand[]): DocumentTransaction {
  return { id: stableId("transaction"), label, commands };
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
