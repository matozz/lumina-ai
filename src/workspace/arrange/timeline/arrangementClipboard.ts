import type {
  ArrangementAutomationLane,
  ArrangementDocument,
  CueClip,
  KeyframeDSL,
} from "@/bridge/types";
import { selectionTimeBounds, validateArrangementEdit } from "./arrangementBulkCommands";
import {
  arrangementSelectionFromItems,
  type ArrangementKeyframeSelectionItem,
  type ArrangementSelectionItem,
  type ArrangementTimelineSelection,
} from "./arrangementSelection";
import { ArrangementTimelineError } from "./arrangementTimelineModel";

export interface ArrangementClipboardPayload {
  clips: Array<{
    clip: CueClip;
    lanes: Array<{ lane: ArrangementAutomationLane; trackId: string }>;
    trackId: string;
  }>;
  keyframes: Array<{
    keyframes: KeyframeDSL[];
    laneId: string;
    trackId: string;
  }>;
  originTick: number;
  sourceArrangementId: string;
  spanTicks: number;
  type: "lumina/arrangement-selection-v1";
}

export function copyArrangementSelection(
  arrangement: ArrangementDocument,
  selection: ArrangementTimelineSelection,
): ArrangementClipboardPayload {
  const bounds = selectionTimeBounds(arrangement, selection);
  if (!bounds) throw clipboardError("ARRANGEMENT_CLIPBOARD_EMPTY", "Select timeline items first.");
  const selectedClipIds = new Set(
    selection.items.filter((item) => item.type === "clip").map((item) => item.clipId),
  );
  const clips = selection.items
    .filter((item) => item.type === "clip")
    .map((item) => {
      const clip = arrangement.tracks
        .find((track) => track.id === item.trackId)
        ?.clips?.find((candidate) => candidate.id === item.clipId);
      if (!clip)
        throw clipboardError("ARRANGEMENT_CLIP_MISSING", `CueClip ${item.clipId} is unavailable.`);
      const lanes = arrangement.tracks.flatMap((track) =>
        (track.automation_lanes ?? [])
          .filter(
            (lane) => lane.target.scope === "cue_layer" && lane.target.clip_id === item.clipId,
          )
          .map((lane) => ({ trackId: track.id, lane: structuredClone(lane) })),
      );
      return { trackId: item.trackId, clip: structuredClone(clip), lanes };
    });

  const keyframeGroups = new Map<string, ArrangementKeyframeSelectionItem[]>();
  for (const item of selection.items) {
    if (item.type !== "keyframe") continue;
    const lane = arrangement.tracks
      .find((track) => track.id === item.trackId)
      ?.automation_lanes?.find((candidate) => candidate.id === item.laneId);
    if (lane?.target.scope === "cue_layer" && selectedClipIds.has(lane.target.clip_id)) continue;
    const key = `${item.trackId}\u0000${item.laneId}`;
    keyframeGroups.set(key, [...(keyframeGroups.get(key) ?? []), item]);
  }
  const keyframes = [...keyframeGroups.entries()].map(([key, items]) => {
    const [trackId, laneId] = key.split("\u0000", 2);
    const lane = arrangement.tracks
      .find((track) => track.id === trackId)
      ?.automation_lanes?.find((candidate) => candidate.id === laneId);
    if (!lane)
      throw clipboardError("ARRANGEMENT_AUTOMATION_MISSING", `Lane ${laneId} is unavailable.`);
    const ids = new Set(items.map((item) => item.keyframeId));
    return {
      trackId,
      laneId,
      keyframes: lane.keyframes
        .filter((keyframe) => ids.has(keyframe.id))
        .map((keyframe) => structuredClone(keyframe)),
    };
  });

  return {
    type: "lumina/arrangement-selection-v1",
    sourceArrangementId: arrangement.id,
    originTick: bounds.startTick,
    spanTicks: Math.max(0, bounds.endTick - bounds.startTick),
    clips,
    keyframes,
  };
}

export function pasteArrangementSelection(
  arrangement: ArrangementDocument,
  payload: ArrangementClipboardPayload,
  anchorTick: number,
): ArrangementTimelineSelection {
  if (payload.sourceArrangementId !== arrangement.id) {
    throw clipboardError(
      "ARRANGEMENT_CLIPBOARD_SCOPE",
      "Timeline clipboard paste is limited to the source Arrangement.",
    );
  }
  const next = structuredClone(arrangement);
  const deltaTick = Math.floor(anchorTick) - payload.originTick;
  const clipIds = new Set(
    next.tracks.flatMap((track) => (track.clips ?? []).map((clip) => clip.id)),
  );
  const laneIds = new Set(
    next.tracks.flatMap((track) => (track.automation_lanes ?? []).map((lane) => lane.id)),
  );
  const pastedItems: ArrangementSelectionItem[] = [];

  for (const entry of payload.clips) {
    const track = requiredTrack(next, entry.trackId);
    const clip = structuredClone(entry.clip);
    const oldClipId = clip.id;
    clip.id = derivedId(oldClipId, clipIds);
    clip.start_tick += deltaTick;
    clipIds.add(clip.id);
    track.clips ??= [];
    track.clips.push(clip);
    pastedItems.push({ type: "clip", trackId: entry.trackId, clipId: clip.id });

    for (const laneEntry of entry.lanes) {
      const laneTrack = requiredTrack(next, laneEntry.trackId);
      const lane = structuredClone(laneEntry.lane);
      lane.id = derivedId(lane.id, laneIds);
      laneIds.add(lane.id);
      if (lane.target.scope === "cue_layer" && lane.target.clip_id === oldClipId) {
        lane.target.clip_id = clip.id;
      }
      const keyframeIds = new Set<string>();
      for (const keyframe of lane.keyframes) {
        keyframe.id = derivedId(`${lane.id}-keyframe`, keyframeIds);
        keyframeIds.add(keyframe.id);
        keyframe.time_tick += deltaTick;
      }
      laneTrack.automation_lanes ??= [];
      laneTrack.automation_lanes.push(lane);
    }
  }

  for (const entry of payload.keyframes) {
    const lane = requiredTrack(next, entry.trackId).automation_lanes?.find(
      (candidate) => candidate.id === entry.laneId,
    );
    if (!lane)
      throw clipboardError(
        "ARRANGEMENT_AUTOMATION_MISSING",
        `Lane ${entry.laneId} is unavailable.`,
      );
    const keyframeIds = new Set(lane.keyframes.map((keyframe) => keyframe.id));
    for (const source of entry.keyframes) {
      const keyframe = structuredClone(source);
      keyframe.id = derivedId(`${lane.id}-keyframe`, keyframeIds);
      keyframeIds.add(keyframe.id);
      keyframe.time_tick += deltaTick;
      lane.keyframes.push(keyframe);
      pastedItems.push({
        type: "keyframe",
        trackId: entry.trackId,
        laneId: entry.laneId,
        keyframeId: keyframe.id,
      });
    }
  }

  validateArrangementEdit(next);
  Object.assign(arrangement, next);
  return arrangementSelectionFromItems(pastedItems);
}

export function duplicateArrangementSelection(
  arrangement: ArrangementDocument,
  selection: ArrangementTimelineSelection,
  snapTicks: number,
) {
  const payload = copyArrangementSelection(arrangement, selection);
  return pasteArrangementSelection(
    arrangement,
    payload,
    payload.originTick + Math.max(snapTicks, payload.spanTicks),
  );
}

function requiredTrack(arrangement: ArrangementDocument, trackId: string) {
  const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
  if (!track)
    throw clipboardError("ARRANGEMENT_TRACK_MISSING", `CueTrack ${trackId} is unavailable.`);
  return track;
}

function derivedId(original: string, existing: Set<string>) {
  const stem = original.replace(/(?:-copy(?:-\d+)?)+$/u, "");
  let candidate = `${stem}-copy`;
  let suffix = 2;
  while (existing.has(candidate)) candidate = `${stem}-copy-${suffix++}`;
  return candidate;
}

function clipboardError(code: string, message: string) {
  return new ArrangementTimelineError(
    code,
    message,
    "The clipboard operation was not applied. Choose a valid anchor or selection and retry.",
  );
}
