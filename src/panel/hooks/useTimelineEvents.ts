import { useCallback, useEffect, useMemo, useRef } from "react";
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
import type { AutomationParameterOption } from "../automationParameters";

interface MoveInteraction {
  type: "move";
  originalIndex: number;
  startClientX: number;
  startClientY: number;
  startBeat: number;
  currentDeltaX: number;
  currentDeltaY: number;
  activeTrackName?: string;
  element: HTMLElement;
}

interface ResizeInteraction {
  type: "resize";
  originalIndex: number;
  startClientX: number;
  startDuration: number;
  currentDeltaX: number;
  element: HTMLElement;
}

type TimelineInteraction = MoveInteraction | ResizeInteraction;

export const useTimelineEvents = () => {
  const parsedDsl = useEngineStore(engineSelectors.parsedDsl);
  const interactionState = useRef<{ isInteracting: boolean }>({ isInteracting: false });
  const interaction = useRef<TimelineInteraction | null>(null);
  const timelineEvents = useMemo(() => flattenTimeline(parsedDsl), [parsedDsl]);
  const parsedDslRef = useRef(parsedDsl);
  const timelineEventsRef = useRef(timelineEvents);
  parsedDslRef.current = parsedDsl;
  timelineEventsRef.current = timelineEvents;

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

  const addAutomationLane = useCallback(
    (option: AutomationParameterOption) => {
      if (!parsedDsl) return;
      const ppq = parsedDsl.timeline?.ppq ?? 960;
      const laneDuration = 4 * ppq;
      const startTick = Math.min(
        0xffff_ffff - laneDuration,
        Math.max(0, Math.round(useEngineStore.getState().globalBeat * ppq)),
      );
      const endTick = startTick + laneDuration;
      engineActions.applyDocumentTransaction(
        transaction("Add AutomationLane", {
          type: "add_automation_lane",
          track_id: "automation",
          track_name: "Automation",
          lane: {
            id: stableId("lane"),
            target: option.target,
            keyframes: [
              {
                id: stableId("keyframe"),
                time_tick: startTick,
                value: structuredClone(option.initialValue),
                interpolation: option.definition.automation === "discrete" ? "hold" : "linear",
              },
              {
                id: stableId("keyframe"),
                time_tick: endTick,
                value: structuredClone(option.initialValue),
                interpolation: "hold",
              },
            ],
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

  const nudgeEvent = useCallback(
    (originalIndex: number, deltaBeats: number) => {
      if (!parsedDsl?.timeline) return;
      const view = timelineEvents[originalIndex];
      if (!view?.source_track_id || !view.source_item_id) return;
      const targetBeat = Math.max(0, view.beat + deltaBeats);
      const targetTick = beatsToTicks(targetBeat, parsedDsl.timeline.ppq);
      const command: DocumentCommand =
        view.action.type === "effect"
          ? {
              type: "move_clip",
              track_id: view.source_track_id,
              clip_id: view.source_item_id,
              start_tick: targetTick,
            }
          : {
              type: "move_automation_lane",
              track_id: view.source_track_id,
              lane_id: view.source_item_id,
              delta_tick: targetTick - beatsToTicks(view.beat, parsedDsl.timeline.ppq),
            };
      engineActions.applyDocumentTransaction(transaction("Nudge timeline item", command));
    },
    [parsedDsl, timelineEvents],
  );

  const startMoving = useCallback(
    (
      originalIndex: number,
      clientX: number,
      clientY: number,
      startBeat: number,
      activeTrackName: string | undefined,
      element: HTMLElement,
    ) => {
      interactionState.current.isInteracting = false;
      interaction.current = {
        type: "move",
        originalIndex,
        startClientX: clientX,
        startClientY: clientY,
        startBeat,
        currentDeltaX: 0,
        currentDeltaY: 0,
        activeTrackName,
        element,
      };
    },
    [],
  );

  const startResizing = useCallback(
    (originalIndex: number, clientX: number, startDuration: number, element: HTMLElement) => {
      interactionState.current.isInteracting = false;
      interaction.current = {
        type: "resize",
        originalIndex,
        startClientX: clientX,
        startDuration,
        currentDeltaX: 0,
        element,
      };
    },
    [],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const active = interaction.current;
      if (!active) return;
      interactionState.current.isInteracting = true;
      if (active.type === "resize") {
        active.currentDeltaX = event.clientX - active.startClientX;
        const duration = snappedDuration(active.startDuration, active.currentDeltaX);
        active.element.style.width = `${duration * BEAT_WIDTH}px`;
        return;
      }

      active.currentDeltaX = event.clientX - active.startClientX;
      active.currentDeltaY = event.clientY - active.startClientY;
      const previewBeat = snappedBeat(active.startBeat, active.currentDeltaX);
      const previewDeltaX = (previewBeat - active.startBeat) * BEAT_WIDTH;
      active.element.style.transform = `translate3d(${previewDeltaX}px, ${active.currentDeltaY}px, 0)`;
      const track = document
        .elementsFromPoint?.(event.clientX, event.clientY)
        .find((element) => element.hasAttribute("data-track-name"));
      if (track) active.activeTrackName = track.getAttribute("data-track-name") ?? undefined;
    };

    const finishInteraction = (commit: boolean) => {
      const active = interaction.current;
      if (!active) return;
      const document = parsedDslRef.current;
      const view = timelineEventsRef.current[active.originalIndex];
      const command =
        commit && document?.timeline && view?.source_track_id && view.source_item_id
          ? commandForInteraction(active, document, view)
          : undefined;
      active.element.style.transform = "";
      active.element.style.width = "";
      interaction.current = null;
      if (command) {
        engineActions.applyDocumentTransaction(
          transaction(
            active.type === "move" ? "Move timeline item" : "Resize timeline item",
            command,
          ),
        );
      }
      globalThis.setTimeout(() => {
        if (!interaction.current) interactionState.current.isInteracting = false;
      }, 50);
    };

    const handlePointerUp = () => finishInteraction(true);
    const handlePointerCancel = () => finishInteraction(false);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, []);

  return {
    document: parsedDsl,
    timelineEvents,
    interactionState,
    startMoving,
    startResizing,
    addEvent,
    addAutomationLane,
    deleteEvent,
    nudgeEvent,
    updateAnimationBlock,
  };
};

function commandForInteraction(
  interaction: TimelineInteraction,
  document: FullDSL,
  view: TimelineEventDSL,
): DocumentCommand | undefined {
  if (!document.timeline || !view.source_track_id || !view.source_item_id) return undefined;
  if (interaction.type === "resize") {
    const durationTick = Math.max(
      1,
      beatsToTicks(
        snappedDuration(interaction.startDuration, interaction.currentDeltaX),
        document.timeline.ppq,
      ),
    );
    return view.action.type === "effect"
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
          start_tick: beatsToTicks(view.beat, document.timeline.ppq),
          duration_tick: durationTick,
        };
  }

  const newTick = beatsToTicks(
    snappedBeat(interaction.startBeat, interaction.currentDeltaX),
    document.timeline.ppq,
  );
  const clip = findClip(document, view);
  if (clip) {
    return {
      type: "move_clip",
      track_id: view.source_track_id,
      clip_id: view.source_item_id,
      start_tick: newTick,
      instance_id: interaction.activeTrackName?.startsWith("phaser:")
        ? interaction.activeTrackName.replace("phaser:", "")
        : undefined,
    };
  }
  const lane = findLane(document, view);
  if (lane && lane.keyframes.length > 0) {
    return {
      type: "move_automation_lane",
      track_id: view.source_track_id,
      lane_id: view.source_item_id,
      delta_tick: newTick - lane.keyframes[0].time_tick,
    };
  }
  return undefined;
}

export function flattenTimeline(document: FullDSL | null): TimelineEventDSL[] {
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

function snappedBeat(startBeat: number, deltaX: number) {
  return Math.max(0, Math.floor((startBeat + deltaX / BEAT_WIDTH) * 2) / 2);
}

function snappedDuration(startDuration: number, deltaX: number) {
  return Math.max(0.5, Math.round((startDuration + deltaX / BEAT_WIDTH) * 2) / 2);
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
