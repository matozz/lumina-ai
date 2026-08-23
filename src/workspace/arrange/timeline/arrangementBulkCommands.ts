import type { ArrangementDocument, CueClip } from "@/bridge/types";
import {
  arrangementSelectionItemKey,
  type ArrangementSelectionItem,
  type ArrangementTimelineSelection,
} from "./arrangementSelection";
import { ArrangementTimelineError } from "./arrangementTimelineModel";

export function moveArrangementSelection(
  arrangement: ArrangementDocument,
  selection: ArrangementTimelineSelection,
  deltaTick: number,
) {
  if (!Number.isInteger(deltaTick))
    throw bulkError("ARRANGEMENT_BULK_TICK_INVALID", "Use integer ticks.");
  if (deltaTick === 0 || selection.items.length === 0) return;
  const next = structuredClone(arrangement);
  const selectedClipIds = new Set(
    selection.items.filter((item) => item.type === "clip").map((item) => item.clipId),
  );
  const movedLanes = new Set<string>();

  for (const item of selection.items) {
    if (item.type !== "clip") continue;
    const clip = requiredClip(next, item.trackId, item.clipId);
    clip.start_tick += deltaTick;
    for (const track of next.tracks) {
      for (const lane of track.automation_lanes ?? []) {
        if (lane.target.scope === "cue_layer" && lane.target.clip_id === item.clipId) {
          for (const keyframe of lane.keyframes) keyframe.time_tick += deltaTick;
          movedLanes.add(`${track.id}:${lane.id}`);
        }
      }
    }
  }

  for (const item of selection.items) {
    if (item.type !== "keyframe" || movedLanes.has(`${item.trackId}:${item.laneId}`)) continue;
    requiredKeyframe(next, item).time_tick += deltaTick;
  }

  validateArrangementEdit(next);
  replaceArrangement(arrangement, next);
  return selectedClipIds;
}

export function resizeArrangementSelection(
  arrangement: ArrangementDocument,
  selection: ArrangementTimelineSelection,
  deltaTick: number,
) {
  const clipItems = selection.items.filter((item) => item.type === "clip");
  if (clipItems.length === 0) return;
  if (clipItems.length !== selection.items.length) {
    throw bulkError(
      "ARRANGEMENT_BULK_RESIZE_MIXED",
      "Resize is available only when the selection contains CueClips.",
    );
  }
  const next = structuredClone(arrangement);
  for (const item of clipItems) {
    requiredClip(next, item.trackId, item.clipId).duration_tick += deltaTick;
  }
  validateArrangementEdit(next);
  replaceArrangement(arrangement, next);
}

export function deleteArrangementSelection(
  arrangement: ArrangementDocument,
  selection: ArrangementTimelineSelection,
) {
  if (selection.items.length === 0) return;
  const next = structuredClone(arrangement);
  const clipIds = new Set(
    selection.items.filter((item) => item.type === "clip").map((item) => item.clipId),
  );
  for (const track of next.tracks) {
    track.clips = track.clips?.filter((clip) => !clipIds.has(clip.id));
    track.automation_lanes = track.automation_lanes?.filter(
      (lane) => lane.target.scope !== "cue_layer" || !clipIds.has(lane.target.clip_id),
    );
  }

  const byLane = selectedKeyframesByLane(selection.items);
  for (const [laneKey, keyframeIds] of byLane) {
    const [trackId, laneId] = splitLaneKey(laneKey);
    const lane = next.tracks
      .find((track) => track.id === trackId)
      ?.automation_lanes?.find((candidate) => candidate.id === laneId);
    if (!lane) continue;
    const retained = lane.keyframes.filter((keyframe) => !keyframeIds.has(keyframe.id));
    if (retained.length === 0) {
      throw bulkError(
        "ARRANGEMENT_KEYFRAME_REQUIRED",
        `Automation lane ${lane.id} must retain one keyframe. Delete the lane or keep one point.`,
      );
    }
    lane.keyframes = retained;
  }
  validateArrangementEdit(next);
  replaceArrangement(arrangement, next);
}

export function validateArrangementEdit(arrangement: ArrangementDocument) {
  for (const track of arrangement.tracks) {
    for (const clip of track.clips ?? []) validateClipRange(arrangement, clip);
    for (const lane of track.automation_lanes ?? []) {
      const ticks = lane.keyframes.map((keyframe) => keyframe.time_tick);
      if (
        ticks.length < 1 ||
        ticks.some(
          (tick) => !Number.isInteger(tick) || tick < 0 || tick >= arrangement.length_ticks,
        )
      ) {
        throw bulkError(
          "ARRANGEMENT_KEYFRAME_MOVE_INVALID",
          `Automation lane ${lane.id} would contain an invalid tick.`,
        );
      }
      lane.keyframes.sort((left, right) => left.time_tick - right.time_tick);
    }
  }
}

export function selectionTimeBounds(
  arrangement: ArrangementDocument,
  selection: ArrangementTimelineSelection,
) {
  const points: number[] = [];
  for (const item of selection.items) {
    if (item.type === "clip") {
      const clip = requiredClip(arrangement, item.trackId, item.clipId);
      points.push(clip.start_tick, clip.start_tick + clip.duration_tick);
      for (const track of arrangement.tracks) {
        for (const lane of track.automation_lanes ?? []) {
          if (lane.target.scope === "cue_layer" && lane.target.clip_id === item.clipId) {
            points.push(...lane.keyframes.map((keyframe) => keyframe.time_tick));
          }
        }
      }
    } else {
      points.push(requiredKeyframe(arrangement, item).time_tick);
    }
  }
  if (points.length === 0) return null;
  return { startTick: Math.min(...points), endTick: Math.max(...points) };
}

export function selectionContainsOnlyClips(selection: ArrangementTimelineSelection) {
  return selection.items.length > 0 && selection.items.every((item) => item.type === "clip");
}

export function selectionKeySet(selection: ArrangementTimelineSelection) {
  return new Set(selection.items.map(arrangementSelectionItemKey));
}

function requiredClip(arrangement: ArrangementDocument, trackId: string, clipId: string) {
  const clip = arrangement.tracks
    .find((track) => track.id === trackId)
    ?.clips?.find((candidate) => candidate.id === clipId);
  if (!clip) throw bulkError("ARRANGEMENT_CLIP_MISSING", `CueClip ${clipId} is unavailable.`);
  return clip;
}

function requiredKeyframe(
  arrangement: ArrangementDocument,
  item: Extract<ArrangementSelectionItem, { type: "keyframe" }>,
) {
  const keyframe = arrangement.tracks
    .find((track) => track.id === item.trackId)
    ?.automation_lanes?.find((lane) => lane.id === item.laneId)
    ?.keyframes.find((candidate) => candidate.id === item.keyframeId);
  if (!keyframe) {
    throw bulkError("ARRANGEMENT_KEYFRAME_MISSING", `Keyframe ${item.keyframeId} is unavailable.`);
  }
  return keyframe;
}

function validateClipRange(arrangement: ArrangementDocument, clip: CueClip) {
  if (
    !Number.isInteger(clip.start_tick) ||
    !Number.isInteger(clip.duration_tick) ||
    clip.start_tick < 0 ||
    clip.duration_tick < 1 ||
    clip.start_tick + clip.duration_tick > arrangement.length_ticks
  ) {
    throw bulkError(
      "ARRANGEMENT_CLIP_RANGE_INVALID",
      `CueClip ${clip.id} must stay between tick 0 and ${arrangement.length_ticks}.`,
    );
  }
}

function selectedKeyframesByLane(items: ArrangementSelectionItem[]) {
  const byLane = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.type !== "keyframe") continue;
    const key = `${item.trackId}\u0000${item.laneId}`;
    const ids = byLane.get(key) ?? new Set<string>();
    ids.add(item.keyframeId);
    byLane.set(key, ids);
  }
  return byLane;
}

function splitLaneKey(key: string) {
  return key.split("\u0000", 2) as [string, string];
}

function replaceArrangement(target: ArrangementDocument, source: ArrangementDocument) {
  Object.assign(target, source);
}

function bulkError(code: string, message: string) {
  return new ArrangementTimelineError(
    code,
    message,
    "The whole selection was left unchanged. Adjust its range or selection and retry.",
  );
}
