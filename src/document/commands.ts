import type {
  AutomationLaneDSL,
  ClipPlaybackDSL,
  EffectClipDSL,
  FullDSL,
  KeyframeDSL,
  TimelineTrackDSL,
} from "@/bridge/types";

export type DocumentCommand =
  | {
      type: "add_clip";
      track_id: string;
      track_name?: string;
      clip: EffectClipDSL;
    }
  | { type: "delete_clip"; track_id: string; clip_id: string }
  | {
      type: "move_clip";
      track_id: string;
      clip_id: string;
      start_tick: number;
      instance_id?: string;
    }
  | { type: "resize_clip"; track_id: string; clip_id: string; duration_tick: number }
  | {
      type: "duplicate_clip";
      track_id: string;
      clip_id: string;
      new_clip_id: string;
      start_tick: number;
      layer?: number;
    }
  | {
      type: "split_clip";
      track_id: string;
      clip_id: string;
      split_tick: number;
      right_clip_id: string;
    }
  | {
      type: "trim_clip";
      track_id: string;
      clip_id: string;
      start_tick: number;
      duration_tick: number;
      source_offset_tick: number;
    }
  | {
      type: "set_clip_playback";
      track_id: string;
      clip_id: string;
      playback: ClipPlaybackDSL;
    }
  | {
      type: "add_automation_lane";
      track_id: string;
      track_name?: string;
      lane: AutomationLaneDSL;
    }
  | { type: "delete_automation_lane"; track_id: string; lane_id: string }
  | {
      type: "replace_automation_lane";
      track_id: string;
      lane_id: string;
      lane: AutomationLaneDSL;
    }
  | {
      type: "move_automation_lane";
      track_id: string;
      lane_id: string;
      delta_tick: number;
    }
  | {
      type: "scale_automation_lane";
      track_id: string;
      lane_id: string;
      start_tick: number;
      duration_tick: number;
    }
  | {
      type: "add_keyframe";
      track_id: string;
      lane_id: string;
      keyframe: KeyframeDSL;
    }
  | {
      type: "move_keyframes";
      track_id: string;
      lane_id: string;
      keyframe_ids: string[];
      delta_tick: number;
    }
  | {
      type: "delete_keyframes";
      track_id: string;
      lane_id: string;
      keyframe_ids: string[];
    };

export interface DocumentTransaction {
  id: string;
  label: string;
  commands: DocumentCommand[];
}

export class DocumentCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentCommandError";
  }
}

const MAX_TICK = 0xffff_ffff;

export function applyDocumentTransaction(
  document: FullDSL,
  transaction: DocumentTransaction,
): FullDSL {
  if (transaction.commands.length === 0) return document;
  const next = structuredClone(document);
  for (const command of transaction.commands) applyCommand(next, command);
  return next;
}

function applyCommand(document: FullDSL, command: DocumentCommand) {
  switch (command.type) {
    case "add_clip": {
      assertItemIdAvailable(document, command.clip.id);
      assertClip(command.clip);
      const track = ensureTrack(document, command.track_id, command.track_name);
      track.clips ??= [];
      track.clips.push(structuredClone(command.clip));
      return;
    }
    case "delete_clip": {
      const track = findTrack(document, command.track_id);
      const index = (track.clips ?? []).findIndex((clip) => clip.id === command.clip_id);
      if (index < 0) throw missing("EffectClip", command.clip_id);
      track.clips?.splice(index, 1);
      return;
    }
    case "move_clip": {
      const clip = findClip(document, command.track_id, command.clip_id);
      assertTick(command.start_tick, "start_tick", true);
      clip.start_tick = command.start_tick;
      if (command.instance_id !== undefined) clip.instance_id = command.instance_id;
      assertClip(clip);
      return;
    }
    case "resize_clip": {
      const clip = findClip(document, command.track_id, command.clip_id);
      assertTick(command.duration_tick, "duration_tick", false);
      clip.duration_tick = command.duration_tick;
      assertClip(clip);
      return;
    }
    case "duplicate_clip": {
      assertItemIdAvailable(document, command.new_clip_id);
      assertTick(command.start_tick, "start_tick", true);
      const track = findTrack(document, command.track_id);
      const source = findClip(document, command.track_id, command.clip_id);
      track.clips ??= [];
      const duplicate = {
        ...structuredClone(source),
        id: command.new_clip_id,
        start_tick: command.start_tick,
        layer: command.layer ?? source.layer,
      };
      assertClip(duplicate);
      track.clips.push(duplicate);
      return;
    }
    case "split_clip": {
      assertItemIdAvailable(document, command.right_clip_id);
      const track = findTrack(document, command.track_id);
      const source = findClip(document, command.track_id, command.clip_id);
      const end = source.start_tick + source.duration_tick;
      if (command.split_tick <= source.start_tick || command.split_tick >= end) {
        throw new DocumentCommandError("split_tick must be strictly inside the EffectClip");
      }
      const leftDuration = command.split_tick - source.start_tick;
      const right = {
        ...structuredClone(source),
        id: command.right_clip_id,
        start_tick: command.split_tick,
        duration_tick: end - command.split_tick,
        source_offset_tick: (source.source_offset_tick ?? 0) + leftDuration,
      };
      source.duration_tick = leftDuration;
      assertClip(source);
      assertClip(right);
      track.clips ??= [];
      track.clips.push(right);
      return;
    }
    case "trim_clip": {
      const clip = findClip(document, command.track_id, command.clip_id);
      assertTick(command.start_tick, "start_tick", true);
      assertTick(command.duration_tick, "duration_tick", false);
      assertTick(command.source_offset_tick, "source_offset_tick", true);
      clip.start_tick = command.start_tick;
      clip.duration_tick = command.duration_tick;
      clip.source_offset_tick = command.source_offset_tick;
      assertClip(clip);
      return;
    }
    case "set_clip_playback": {
      findClip(document, command.track_id, command.clip_id).playback = command.playback;
      return;
    }
    case "add_automation_lane": {
      assertItemIdAvailable(document, command.lane.id);
      assertTargetAvailable(document, command.lane);
      assertLane(command.lane);
      const track = ensureTrack(document, command.track_id, command.track_name);
      track.automation_lanes ??= [];
      track.automation_lanes.push(structuredClone(command.lane));
      return;
    }
    case "delete_automation_lane": {
      const track = findTrack(document, command.track_id);
      const index = (track.automation_lanes ?? []).findIndex((lane) => lane.id === command.lane_id);
      if (index < 0) throw missing("AutomationLane", command.lane_id);
      track.automation_lanes?.splice(index, 1);
      return;
    }
    case "replace_automation_lane": {
      const track = findTrack(document, command.track_id);
      const index = (track.automation_lanes ?? []).findIndex((lane) => lane.id === command.lane_id);
      if (index < 0) throw missing("AutomationLane", command.lane_id);
      if (command.lane.id !== command.lane_id) {
        assertItemIdAvailable(document, command.lane.id);
      }
      assertTargetAvailable(document, command.lane, command.lane_id);
      assertLane(command.lane);
      track.automation_lanes![index] = structuredClone(command.lane);
      return;
    }
    case "move_automation_lane": {
      const lane = findLane(document, command.track_id, command.lane_id);
      if (!Number.isInteger(command.delta_tick)) {
        throw new DocumentCommandError("delta_tick must be an integer");
      }
      if (lane.keyframes.some((keyframe) => keyframe.time_tick + command.delta_tick < 0)) {
        throw new DocumentCommandError("moving the lane would create a negative keyframe tick");
      }
      if (lane.keyframes.some((keyframe) => keyframe.time_tick + command.delta_tick > MAX_TICK)) {
        throw new DocumentCommandError("moving the lane would exceed the supported tick range");
      }
      for (const keyframe of lane.keyframes) keyframe.time_tick += command.delta_tick;
      return;
    }
    case "scale_automation_lane": {
      assertTick(command.start_tick, "start_tick", true);
      assertTick(command.duration_tick, "duration_tick", false);
      const lane = findLane(document, command.track_id, command.lane_id);
      if (lane.keyframes.length === 0) throw new DocumentCommandError("lane has no keyframes");
      if (lane.keyframes.length === 1) {
        lane.keyframes[0].time_tick = command.start_tick;
        return;
      }
      const oldStart = lane.keyframes[0].time_tick;
      const oldDuration = lane.keyframes[lane.keyframes.length - 1].time_tick - oldStart;
      if (oldDuration <= 0) throw new DocumentCommandError("lane duration must be positive");
      const scaledTicks = lane.keyframes.map(
        (keyframe) =>
          command.start_tick +
          Math.round(((keyframe.time_tick - oldStart) / oldDuration) * command.duration_tick),
      );
      if (
        scaledTicks.some((tick) => tick > MAX_TICK) ||
        scaledTicks.some((tick, index) => index > 0 && scaledTicks[index - 1] >= tick)
      ) {
        throw new DocumentCommandError(
          "scaled keyframes must fit the tick range and remain strictly increasing",
        );
      }
      lane.keyframes.forEach((keyframe, index) => {
        keyframe.time_tick = scaledTicks[index];
      });
      return;
    }
    case "add_keyframe": {
      const lane = findLane(document, command.track_id, command.lane_id);
      if (lane.keyframes.some((keyframe) => keyframe.id === command.keyframe.id)) {
        throw new DocumentCommandError(`keyframe ID already exists: ${command.keyframe.id}`);
      }
      lane.keyframes.push(structuredClone(command.keyframe));
      lane.keyframes.sort((left, right) => left.time_tick - right.time_tick);
      assertLane(lane);
      return;
    }
    case "move_keyframes": {
      if (!Number.isInteger(command.delta_tick)) {
        throw new DocumentCommandError("delta_tick must be an integer");
      }
      const lane = findLane(document, command.track_id, command.lane_id);
      const selected = new Set(command.keyframe_ids);
      if (selected.size === 0) return;
      if (lane.keyframes.filter((keyframe) => selected.has(keyframe.id)).length !== selected.size) {
        throw new DocumentCommandError("one or more selected keyframes do not exist");
      }
      for (const keyframe of lane.keyframes) {
        if (selected.has(keyframe.id)) keyframe.time_tick += command.delta_tick;
      }
      lane.keyframes.sort((left, right) => left.time_tick - right.time_tick);
      assertLane(lane);
      return;
    }
    case "delete_keyframes": {
      const lane = findLane(document, command.track_id, command.lane_id);
      const selected = new Set(command.keyframe_ids);
      if (lane.keyframes.filter((keyframe) => selected.has(keyframe.id)).length !== selected.size) {
        throw new DocumentCommandError("one or more selected keyframes do not exist");
      }
      lane.keyframes = lane.keyframes.filter((keyframe) => !selected.has(keyframe.id));
      assertLane(lane);
      return;
    }
  }
}

function ensureTrack(document: FullDSL, id: string, name = id): TimelineTrackDSL {
  document.timeline ??= {
    ppq: 960,
    tempo_map: { points: [{ time_tick: 0, bpm: 120 }] },
    tracks: [],
  };
  let track = document.timeline.tracks.find((candidate) => candidate.id === id);
  if (!track) {
    track = {
      id,
      name,
      overlap_policy: "layer",
      clips: [],
      automation_lanes: [],
    };
    document.timeline.tracks.push(track);
  }
  return track;
}

function findTrack(document: FullDSL, id: string): TimelineTrackDSL {
  const track = document.timeline?.tracks.find((candidate) => candidate.id === id);
  if (!track) throw missing("TimelineTrack", id);
  return track;
}

function findClip(document: FullDSL, trackId: string, clipId: string): EffectClipDSL {
  const clip = findTrack(document, trackId).clips?.find((candidate) => candidate.id === clipId);
  if (!clip) throw missing("EffectClip", clipId);
  return clip;
}

function findLane(document: FullDSL, trackId: string, laneId: string): AutomationLaneDSL {
  const lane = findTrack(document, trackId).automation_lanes?.find(
    (candidate) => candidate.id === laneId,
  );
  if (!lane) throw missing("AutomationLane", laneId);
  return lane;
}

function assertItemIdAvailable(document: FullDSL, id: string) {
  const exists = document.timeline?.tracks.some(
    (track) =>
      track.clips?.some((clip) => clip.id === id) ||
      track.automation_lanes?.some((lane) => lane.id === id),
  );
  if (exists) throw new DocumentCommandError(`timeline item ID already exists: ${id}`);
}

function assertTargetAvailable(document: FullDSL, lane: AutomationLaneDSL, exceptId?: string) {
  const target = targetKey(lane);
  const exists = document.timeline?.tracks.some((track) =>
    track.automation_lanes?.some(
      (candidate) => candidate.id !== exceptId && targetKey(candidate) === target,
    ),
  );
  if (exists) throw new DocumentCommandError("automation target already has a lane");
}

function assertTick(value: number, name: string, allowZero: boolean) {
  if (!Number.isInteger(value) || value > MAX_TICK || (allowZero ? value < 0 : value <= 0)) {
    throw new DocumentCommandError(
      `${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`,
    );
  }
}

function assertClip(clip: EffectClipDSL) {
  assertTick(clip.start_tick, "start_tick", true);
  assertTick(clip.duration_tick, "duration_tick", false);
  assertTick(clip.source_offset_tick ?? 0, "source_offset_tick", true);
  if (clip.start_tick + clip.duration_tick > MAX_TICK) {
    throw new DocumentCommandError("EffectClip end exceeds the supported tick range");
  }
  if (clip.layer !== undefined && !Number.isInteger(clip.layer)) {
    throw new DocumentCommandError("EffectClip layer must be an integer");
  }
}

function assertLane(lane: AutomationLaneDSL) {
  if (lane.keyframes.length === 0) {
    throw new DocumentCommandError("AutomationLane requires at least one keyframe");
  }
  const ids = new Set<string>();
  lane.keyframes.forEach((keyframe, index) => {
    assertTick(keyframe.time_tick, "time_tick", true);
    if (!keyframe.id || ids.has(keyframe.id)) {
      throw new DocumentCommandError("AutomationLane keyframe IDs must be non-empty and unique");
    }
    ids.add(keyframe.id);
    if (index > 0 && lane.keyframes[index - 1].time_tick >= keyframe.time_tick) {
      throw new DocumentCommandError("AutomationLane keyframes must be strictly increasing");
    }
  });
}

function targetKey(lane: AutomationLaneDSL) {
  return lane.target.scope === "global"
    ? `global:${lane.target.parameter_id}`
    : `effect_instance:${lane.target.instance_id}:${lane.target.parameter_id}`;
}

function missing(type: string, id: string) {
  return new DocumentCommandError(`${type} not found: ${id}`);
}
