import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  AutomationLaneDSL,
  FromTo,
  FullDSL,
  KeyframeDSL,
  KeyframeInterpolationDSL,
  ParameterValueDSL,
  TimelineEventDSL,
  TimelineTrackDSL,
} from "@/bridge/types";
import type { DocumentCommand, DocumentTransaction } from "@/document/commands";
import { clipOverlapPlan } from "@/document/clipOverlapPlan";
import { useEngineStore, engineActions, engineSelectors } from "@/stores/engine";
import type { AutomationParameterOption } from "../automationParameters";
import {
  createTimelineGeometry,
  pointerDeltaWithScroll,
  snappedDurationForPointerDelta,
  snappedTickForPointerDelta,
  ticksToPixels,
  type TimelineGeometry,
} from "../timelineGeometry";

interface TimelineEventsOptions {
  beatWidth: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

interface MoveInteraction {
  type: "move";
  itemType: "clip" | "lane";
  trackId: string;
  itemId: string;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  currentClientX: number;
  currentClientY: number;
  originalStartTick: number;
  originalDurationTick?: number;
  originalInstanceId?: string;
  previewStartTick: number;
  activeTrackName?: string;
  geometry: TimelineGeometry;
  element: HTMLElement;
  originalWidth: string;
}

interface ResizeInteraction {
  type: "resize";
  trackId: string;
  itemId: string;
  startClientX: number;
  startScrollLeft: number;
  currentClientX: number;
  originalStartTick: number;
  originalDurationTick: number;
  previewDurationTick: number;
  geometry: TimelineGeometry;
  element: HTMLElement;
  originalWidth: string;
}

type TimelineInteraction = MoveInteraction | ResizeInteraction;

export const useTimelineEvents = ({ beatWidth, scrollRef }: TimelineEventsOptions) => {
  const parsedDsl = useEngineStore(engineSelectors.parsedDsl);
  const interactionState = useRef<{ isInteracting: boolean }>({ isInteracting: false });
  const interaction = useRef<TimelineInteraction | null>(null);
  const animationFrame = useRef<number | null>(null);
  const snapGuideRef = useRef<HTMLDivElement>(null);
  const timelineEvents = useMemo(() => flattenTimeline(parsedDsl), [parsedDsl]);
  const parsedDslRef = useRef(parsedDsl);
  const timelineEventsRef = useRef(timelineEvents);
  parsedDslRef.current = parsedDsl;
  timelineEventsRef.current = timelineEvents;
  const geometry = useMemo(
    () => createTimelineGeometry(parsedDsl?.timeline?.ppq ?? 960, beatWidth),
    [beatWidth, parsedDsl?.timeline?.ppq],
  );

  const addEvent = useCallback(
    (newEvent: TimelineEventDSL) => {
      if (!parsedDsl || newEvent.action.type !== "effect") return;
      const ppq = parsedDsl.timeline?.ppq ?? 960;
      const track = parsedDsl.timeline?.tracks.find((candidate) => candidate.id === "effects");
      engineActions.applyDocumentTransaction(
        transaction("Add EffectClip", {
          type: "add_clip",
          track_id: "effects",
          track_name: "Lighting looks",
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

  const addKeyframe = useCallback(
    (
      trackId: string,
      laneId: string,
      timeTick: number,
      value: ParameterValueDSL,
      interpolation: KeyframeInterpolationDSL,
    ) => {
      engineActions.applyDocumentTransaction(
        transaction("Add keyframe", {
          type: "add_keyframe",
          track_id: trackId,
          lane_id: laneId,
          keyframe: {
            id: stableId("keyframe"),
            time_tick: timeTick,
            value: structuredClone(value),
            interpolation,
          },
        }),
      );
    },
    [],
  );

  const moveKeyframes = useCallback(
    (trackId: string, laneId: string, keyframeIds: string[], deltaTick: number) => {
      engineActions.applyDocumentTransaction(
        transaction("Move keyframes", {
          type: "move_keyframes",
          track_id: trackId,
          lane_id: laneId,
          keyframe_ids: keyframeIds,
          delta_tick: deltaTick,
        }),
      );
    },
    [],
  );

  const deleteKeyframes = useCallback((trackId: string, laneId: string, keyframeIds: string[]) => {
    engineActions.applyDocumentTransaction(
      transaction("Delete keyframes", {
        type: "delete_keyframes",
        track_id: trackId,
        lane_id: laneId,
        keyframe_ids: keyframeIds,
      }),
    );
  }, []);

  const updateKeyframe = useCallback(
    (
      trackId: string,
      laneId: string,
      keyframeId: string,
      changes: Partial<Pick<KeyframeDSL, "time_tick" | "value" | "interpolation">>,
    ) => {
      engineActions.applyDocumentTransaction(
        transaction("Update keyframe", {
          type: "update_keyframe",
          track_id: trackId,
          lane_id: laneId,
          keyframe_id: keyframeId,
          ...changes,
        }),
      );
    },
    [],
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

  const trimClipOverlaps = useCallback(
    (originalIndex: number) => {
      if (!parsedDsl) return;
      const view = timelineEvents[originalIndex];
      if (!view?.source_track_id || !view.source_item_id) return;
      const plan = clipOverlapPlan(parsedDsl, view.source_track_id, view.source_item_id);
      if (!plan?.trim || plan.overlappingClipIds.length === 0) return;
      engineActions.applyDocumentTransaction(
        transaction("Trim EffectClip overlap", {
          type: "trim_clip",
          track_id: plan.track.id,
          clip_id: plan.clip.id,
          start_tick: plan.trim.startTick,
          duration_tick: plan.trim.durationTick,
          source_offset_tick: plan.trim.sourceOffsetTick,
        }),
      );
    },
    [parsedDsl, timelineEvents],
  );

  const replaceClipOverlaps = useCallback(
    (originalIndex: number) => {
      if (!parsedDsl) return;
      const view = timelineEvents[originalIndex];
      if (!view?.source_track_id || !view.source_item_id) return;
      const plan = clipOverlapPlan(parsedDsl, view.source_track_id, view.source_item_id);
      if (!plan || plan.overlappingClipIds.length === 0) return;
      engineActions.applyDocumentTransaction(
        transaction(
          "Replace overlapping EffectClips",
          ...plan.overlappingClipIds.map(
            (clipId): DocumentCommand => ({
              type: "delete_clip",
              track_id: plan.track.id,
              clip_id: clipId,
            }),
          ),
        ),
      );
    },
    [parsedDsl, timelineEvents],
  );

  const showSnapPreview = useCallback(
    (tick: number) => {
      const guide = snapGuideRef.current;
      if (!guide) return;
      const activeGeometry = interaction.current?.geometry ?? geometry;
      guide.style.display = "block";
      guide.style.left = `${ticksToPixels(tick, activeGeometry)}px`;
      guide.dataset.snapTick = String(tick);
      const label = guide.querySelector<HTMLElement>("[data-snap-label]");
      if (label) label.textContent = `tick ${tick}`;
    },
    [geometry],
  );

  const hideSnapPreview = useCallback(() => {
    const guide = snapGuideRef.current;
    if (!guide) return;
    guide.style.display = "none";
    delete guide.dataset.snapTick;
  }, []);

  const startMoving = useCallback(
    (
      originalIndex: number,
      clientX: number,
      clientY: number,
      activeTrackName: string | undefined,
      element: HTMLElement,
    ) => {
      const document = parsedDslRef.current;
      const view = timelineEventsRef.current[originalIndex];
      if (!document?.timeline || !view?.source_track_id || !view.source_item_id) return;
      const clip = findClip(document, view);
      const lane = findLane(document, view);
      const originalStartTick = clip?.start_tick ?? lane?.keyframes[0]?.time_tick;
      if (originalStartTick === undefined) return;
      const originalDurationTick = clip?.duration_tick;
      const originalWidth = element.style.width || globalThis.getComputedStyle(element).width;
      if (originalDurationTick !== undefined) element.style.width = originalWidth;
      interactionState.current.isInteracting = false;
      interaction.current = {
        type: "move",
        itemType: clip ? "clip" : "lane",
        trackId: view.source_track_id,
        itemId: view.source_item_id,
        startClientX: clientX,
        startClientY: clientY,
        startScrollLeft: scrollRef.current?.scrollLeft ?? 0,
        currentClientX: clientX,
        currentClientY: clientY,
        originalStartTick,
        originalDurationTick,
        originalInstanceId: clip?.instance_id,
        previewStartTick: originalStartTick,
        activeTrackName,
        geometry,
        element,
        originalWidth,
      };
    },
    [geometry, scrollRef],
  );

  const startResizing = useCallback(
    (originalIndex: number, clientX: number, element: HTMLElement) => {
      const document = parsedDslRef.current;
      const view = timelineEventsRef.current[originalIndex];
      const clip = document ? findClip(document, view) : undefined;
      if (!view?.source_track_id || !view.source_item_id || !clip) return;
      const originalWidth = element.style.width || globalThis.getComputedStyle(element).width;
      element.style.width = originalWidth;
      interactionState.current.isInteracting = false;
      interaction.current = {
        type: "resize",
        trackId: view.source_track_id,
        itemId: view.source_item_id,
        startClientX: clientX,
        startScrollLeft: scrollRef.current?.scrollLeft ?? 0,
        currentClientX: clientX,
        originalStartTick: clip.start_tick,
        originalDurationTick: clip.duration_tick,
        previewDurationTick: clip.duration_tick,
        geometry,
        element,
        originalWidth,
      };
    },
    [geometry, scrollRef],
  );

  useEffect(() => {
    const applyPointerPreview = (active: TimelineInteraction) => {
      const currentScrollLeft = scrollRef.current?.scrollLeft ?? active.startScrollLeft;
      const deltaX = pointerDeltaWithScroll(
        active.startClientX,
        active.currentClientX,
        active.startScrollLeft,
        currentScrollLeft,
      );
      if (active.type === "resize") {
        active.previewDurationTick = snappedDurationForPointerDelta(
          active.originalStartTick,
          active.originalDurationTick,
          deltaX,
          active.geometry,
        );
        active.element.style.width = `${ticksToPixels(active.previewDurationTick, active.geometry)}px`;
        showSnapPreview(active.originalStartTick + active.previewDurationTick);
        return;
      }

      active.previewStartTick = snappedTickForPointerDelta(
        active.originalStartTick,
        deltaX,
        active.geometry,
      );
      const previewDeltaX = ticksToPixels(
        active.previewStartTick - active.originalStartTick,
        active.geometry,
      );
      active.element.style.transform = `translate3d(${previewDeltaX}px, ${active.currentClientY - active.startClientY}px, 0)`;
      if (active.originalDurationTick !== undefined)
        active.element.style.width = active.originalWidth;
      const track = globalThis.document
        .elementsFromPoint?.(active.currentClientX, active.currentClientY)
        .find((element) => element.hasAttribute("data-track-name"));
      if (track) active.activeTrackName = track.getAttribute("data-track-name") ?? undefined;
      showSnapPreview(active.previewStartTick);
    };

    const flushPointerPreview = () => {
      animationFrame.current = null;
      const active = interaction.current;
      if (active) applyPointerPreview(active);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const active = interaction.current;
      if (!active) return;
      interactionState.current.isInteracting = true;
      active.currentClientX = event.clientX;
      if (active.type === "move") active.currentClientY = event.clientY;
      if (animationFrame.current === null) {
        animationFrame.current = globalThis.requestAnimationFrame(flushPointerPreview);
      }
    };

    const finishInteraction = (commit: boolean) => {
      const active = interaction.current;
      if (!active) return;
      if (animationFrame.current !== null) {
        globalThis.cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
        applyPointerPreview(active);
      }
      const command = commit ? commandForInteraction(active) : undefined;
      active.element.style.transform = "";
      if (!commit || active.type === "move") active.element.style.width = active.originalWidth;
      hideSnapPreview();
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && interaction.current) {
        event.preventDefault();
        finishInteraction(false);
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
  }, [hideSnapPreview, scrollRef, showSnapPreview]);

  return {
    document: parsedDsl,
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
    trimClipOverlaps,
    replaceClipOverlaps,
    addKeyframe,
    moveKeyframes,
    deleteKeyframes,
    updateKeyframe,
  };
};

function commandForInteraction(interaction: TimelineInteraction): DocumentCommand | undefined {
  if (interaction.type === "resize") {
    if (interaction.previewDurationTick === interaction.originalDurationTick) return undefined;
    return {
      type: "resize_clip",
      track_id: interaction.trackId,
      clip_id: interaction.itemId,
      duration_tick: interaction.previewDurationTick,
    };
  }

  if (interaction.itemType === "clip") {
    const targetInstanceId = interaction.activeTrackName?.startsWith("phaser:")
      ? interaction.activeTrackName.replace("phaser:", "")
      : interaction.originalInstanceId;
    if (
      interaction.previewStartTick === interaction.originalStartTick &&
      targetInstanceId === interaction.originalInstanceId
    ) {
      return undefined;
    }
    return {
      type: "move_clip",
      track_id: interaction.trackId,
      clip_id: interaction.itemId,
      start_tick: interaction.previewStartTick,
      instance_id: targetInstanceId,
    };
  }
  const deltaTick = interaction.previewStartTick - interaction.originalStartTick;
  return deltaTick === 0
    ? undefined
    : {
        type: "move_automation_lane",
        track_id: interaction.trackId,
        lane_id: interaction.itemId,
        delta_tick: deltaTick,
      };
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
