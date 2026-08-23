import type {
  AutomationLaneDSL,
  ClipPlaybackDSL,
  EffectClipDSL,
  EffectDefinitionDSL,
  EffectInstanceDSL,
  FullDSL,
  GroupDSL,
  KeyframeDSL,
  LayoutDSL,
  PatchDSL,
  TimelineTrackDSL,
} from "@/bridge/types";
import {
  parameterAutomation,
  parameterRange,
  parameterValueType,
} from "@/document/effectParameter";

export type DocumentCommand =
  | { type: "replace_stage_setup"; patch: PatchDSL[]; layout: LayoutDSL; groups: GroupDSL[] }
  | {
      type: "create_effect";
      definition: EffectDefinitionDSL;
      instance: EffectInstanceDSL;
    }
  | {
      type: "revise_effect";
      definition_id: string;
      definition: EffectDefinitionDSL;
      primary_instance: EffectInstanceDSL;
    }
  | { type: "delete_effect"; definition_id: string }
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
    }
  | {
      type: "update_keyframe";
      track_id: string;
      lane_id: string;
      keyframe_id: string;
      time_tick?: number;
      value?: KeyframeDSL["value"];
      interpolation?: KeyframeDSL["interpolation"];
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
    case "replace_stage_setup": {
      document.patch = structuredClone(command.patch);
      document.layout = structuredClone(command.layout);
      document.groups = structuredClone(command.groups);
      return;
    }
    case "create_effect": {
      if (document.effect_definitions.some((item) => item.id === command.definition.id)) {
        throw new DocumentCommandError(`EffectDefinition already exists: ${command.definition.id}`);
      }
      if (document.effect_instances.some((item) => item.id === command.instance.id)) {
        throw new DocumentCommandError(`EffectInstance already exists: ${command.instance.id}`);
      }
      assertEffectPair(command.definition, command.instance);
      document.effect_definitions.push(structuredClone(command.definition));
      document.effect_instances.push(structuredClone(command.instance));
      return;
    }
    case "revise_effect": {
      const definitionIndex = document.effect_definitions.findIndex(
        (item) => item.id === command.definition_id,
      );
      if (definitionIndex < 0) throw missing("EffectDefinition", command.definition_id);
      const previous = document.effect_definitions[definitionIndex];
      if (
        command.definition.id !== previous.id ||
        command.definition.revision !== previous.revision + 1
      ) {
        throw new DocumentCommandError(
          "Effect revision must keep its stable ID and increment once",
        );
      }
      const primaryIndex = document.effect_instances.findIndex(
        (item) => item.id === command.primary_instance.id,
      );
      if (primaryIndex < 0) throw missing("EffectInstance", command.primary_instance.id);
      if (document.effect_instances[primaryIndex].definition_id !== command.definition_id) {
        throw new DocumentCommandError("Primary EffectInstance does not belong to this definition");
      }
      assertEffectPair(command.definition, command.primary_instance);
      document.effect_definitions[definitionIndex] = structuredClone(command.definition);
      document.effect_instances = document.effect_instances.map((instance, index) => {
        if (index === primaryIndex) return structuredClone(command.primary_instance);
        return instance.definition_id === command.definition_id
          ? { ...instance, definition_revision: command.definition.revision }
          : instance;
      });
      return;
    }
    case "delete_effect": {
      const definitionIndex = document.effect_definitions.findIndex(
        (item) => item.id === command.definition_id,
      );
      if (definitionIndex < 0) throw missing("EffectDefinition", command.definition_id);
      const instanceIds = new Set(
        document.effect_instances
          .filter((instance) => instance.definition_id === command.definition_id)
          .map((instance) => instance.id),
      );
      const isUsed = document.timeline?.tracks.some(
        (track) =>
          track.clips?.some((clip) => instanceIds.has(clip.instance_id)) ||
          track.automation_lanes?.some(
            (lane) =>
              lane.target.scope === "effect_instance" && instanceIds.has(lane.target.instance_id),
          ),
      );
      if (isUsed) {
        throw new DocumentCommandError(
          "Remove this effect from Arrange and automation before deleting it",
        );
      }
      document.effect_definitions.splice(definitionIndex, 1);
      document.effect_instances = document.effect_instances.filter(
        (instance) => !instanceIds.has(instance.id),
      );
      return;
    }
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
      assertLaneTargetValues(document, command.lane);
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
      assertLaneTargetValues(document, command.lane);
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
      if (oldDuration === 0) {
        for (const keyframe of lane.keyframes) keyframe.time_tick = command.start_tick;
        return;
      }
      const scaledTicks = lane.keyframes.map(
        (keyframe) =>
          command.start_tick +
          Math.round(((keyframe.time_tick - oldStart) / oldDuration) * command.duration_tick),
      );
      if (
        scaledTicks.some((tick) => tick > MAX_TICK) ||
        scaledTicks.some((tick, index) => index > 0 && scaledTicks[index - 1] > tick)
      ) {
        throw new DocumentCommandError(
          "scaled keyframes must fit the tick range and remain non-decreasing",
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
      assertLaneTargetValues(document, lane);
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
      assertLaneTargetValues(document, lane);
      return;
    }
    case "update_keyframe": {
      const lane = findLane(document, command.track_id, command.lane_id);
      const keyframe = lane.keyframes.find((candidate) => candidate.id === command.keyframe_id);
      if (!keyframe) throw missing("Keyframe", command.keyframe_id);
      if (command.time_tick !== undefined) keyframe.time_tick = command.time_tick;
      if (command.value !== undefined) keyframe.value = structuredClone(command.value);
      if (command.interpolation !== undefined) keyframe.interpolation = command.interpolation;
      lane.keyframes.sort((left, right) => left.time_tick - right.time_tick);
      assertLane(lane);
      assertLaneTargetValues(document, lane);
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

function assertEffectPair(definition: EffectDefinitionDSL, instance: EffectInstanceDSL) {
  if (
    instance.definition_id !== definition.id ||
    instance.definition_revision !== definition.revision
  ) {
    throw new DocumentCommandError(
      "EffectInstance must reference the supplied definition revision",
    );
  }
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
    if (index > 0 && lane.keyframes[index - 1].time_tick > keyframe.time_tick) {
      throw new DocumentCommandError("AutomationLane keyframes must be non-decreasing");
    }
  });
}

function assertLaneTargetValues(document: FullDSL, lane: AutomationLaneDSL) {
  const parameter =
    lane.target.scope === "global"
      ? undefined
      : resolveEffectParameter(document, lane.target.instance_id, lane.target.parameter_id);
  const valueType = parameter ? parameterValueType(parameter) : "scalar";
  const range = parameter ? parameterRange(parameter) : ([0, 1] as [number, number]);
  const automation = parameter ? parameterAutomation(parameter) : "continuous";

  for (const keyframe of lane.keyframes) {
    if (keyframe.value.type !== valueType) {
      throw new DocumentCommandError(
        `keyframe value type ${keyframe.value.type} does not match ${valueType}`,
      );
    }
    if (
      keyframe.value.type === "scalar" &&
      range &&
      (keyframe.value.value < range[0] || keyframe.value.value > range[1])
    ) {
      throw new DocumentCommandError("keyframe scalar value is outside the parameter range");
    }
    if (automation === "discrete" && keyframe.interpolation !== "hold") {
      throw new DocumentCommandError("discrete automation keyframes must use hold interpolation");
    }
  }
}

function resolveEffectParameter(document: FullDSL, instanceId: string, parameterId: string) {
  const instance = document.effect_instances.find((candidate) => candidate.id === instanceId);
  if (!instance) throw missing("EffectInstance", instanceId);
  const definition = document.effect_definitions.find(
    (candidate) =>
      candidate.id === instance.definition_id &&
      candidate.revision === instance.definition_revision,
  );
  if (!definition) {
    throw new DocumentCommandError(
      `EffectDefinition revision not found: ${instance.definition_id}@${instance.definition_revision}`,
    );
  }
  const parameter = definition.parameters.find((candidate) => candidate.id === parameterId);
  if (!parameter) throw missing("EffectParameter", parameterId);
  return parameter;
}

function targetKey(lane: AutomationLaneDSL) {
  return lane.target.scope === "global"
    ? `global:${lane.target.parameter_id}`
    : `effect_instance:${lane.target.instance_id}:${lane.target.parameter_id}`;
}

function missing(type: string, id: string) {
  return new DocumentCommandError(`${type} not found: ${id}`);
}
