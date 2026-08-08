import type {
  ArrangementAutomationLane,
  ArrangementAutomationTarget,
  ArrangementDocument,
  CueClip,
  KeyframeDSL,
  KeyframeInterpolationDSL,
  ParameterDefinitionDSL,
  ParameterValueDSL,
  ProjectBundle,
} from "@/bridge/types";
import { exactAsset } from "@/document/projectModel";

export class ArrangementTimelineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint: string,
  ) {
    super(message);
    this.name = "ArrangementTimelineError";
  }
}

export interface ArrangementAutomationOption {
  definition: ParameterDefinitionDSL;
  initialValue: ParameterValueDSL;
  label: string;
  target: ArrangementAutomationTarget;
}

export const MASTER_DIMMER_DEFINITION: ParameterDefinitionDSL = {
  id: "master_dimmer",
  name: "Master dimmer",
  value_type: "scalar",
  default_value: { type: "scalar", value: 1 },
  range: [0, 1],
  unit: "percent",
  ui_hint: "slider",
  automation: "continuous",
};

export function findCueClip(arrangement: ArrangementDocument, clipId: string) {
  for (const track of arrangement.tracks) {
    const clip = track.clips?.find((candidate) => candidate.id === clipId);
    if (clip) return { track, clip };
  }
  throw timelineError(
    "ARRANGEMENT_CLIP_MISSING",
    `CueClip ${clipId} is no longer present in this Arrangement.`,
    "Select an existing CueClip and retry the edit.",
  );
}

export function visibleCueClips(clips: CueClip[], startTick: number, endTick: number) {
  return clips.filter(
    (clip) => clip.start_tick + clip.duration_tick >= startTick && clip.start_tick <= endTick,
  );
}

export function moveCueClip(arrangement: ArrangementDocument, clipId: string, startTick: number) {
  const { track, clip } = findCueClip(arrangement, clipId);
  validateClipRange(arrangement, startTick, clip.duration_tick);
  assertOverlapPolicy(track, clipId, startTick, clip.duration_tick);
  clip.start_tick = startTick;
}

export function resizeCueClip(
  arrangement: ArrangementDocument,
  clipId: string,
  durationTick: number,
) {
  const { track, clip } = findCueClip(arrangement, clipId);
  validateClipRange(arrangement, clip.start_tick, durationTick);
  assertOverlapPolicy(track, clipId, clip.start_tick, durationTick);
  clip.duration_tick = durationTick;
}

export function updateCueClip(
  arrangement: ArrangementDocument,
  clipId: string,
  changes: Partial<
    Pick<CueClip, "start_tick" | "duration_tick" | "source_offset_tick" | "playback" | "layer">
  >,
) {
  const { track, clip } = findCueClip(arrangement, clipId);
  const startTick = changes.start_tick ?? clip.start_tick;
  const durationTick = changes.duration_tick ?? clip.duration_tick;
  validateClipRange(arrangement, startTick, durationTick);
  assertOverlapPolicy(track, clipId, startTick, durationTick);
  if (
    changes.source_offset_tick !== undefined &&
    (!Number.isInteger(changes.source_offset_tick) || changes.source_offset_tick < 0)
  ) {
    throw timelineError(
      "ARRANGEMENT_SOURCE_OFFSET_INVALID",
      "CueClip source offset must be a non-negative integer tick.",
      "Use zero to start at the beginning of the Cue.",
    );
  }
  if (changes.layer !== undefined && (!Number.isInteger(changes.layer) || changes.layer < 0)) {
    throw timelineError(
      "ARRANGEMENT_LAYER_INVALID",
      "CueClip layer must be a non-negative integer.",
      "Use layer 0 for the base layer.",
    );
  }
  Object.assign(clip, changes);
}

export function deleteCueClip(arrangement: ArrangementDocument, clipId: string) {
  const { track } = findCueClip(arrangement, clipId);
  track.clips = track.clips?.filter((candidate) => candidate.id !== clipId);
  for (const candidate of arrangement.tracks) {
    candidate.automation_lanes = candidate.automation_lanes?.filter(
      (lane) => lane.target.scope !== "cue_layer" || lane.target.clip_id !== clipId,
    );
  }
}

export function duplicateCueClip(
  arrangement: ArrangementDocument,
  clipId: string,
  offsetTick: number,
) {
  const { track, clip } = findCueClip(arrangement, clipId);
  const startTick = Math.min(
    arrangement.length_ticks - clip.duration_tick,
    clip.start_tick + Math.max(1, offsetTick),
  );
  const id = uniqueId(
    `${clip.id}-copy`,
    arrangement.tracks.flatMap((item) => item.clips ?? []),
  );
  validateClipRange(arrangement, startTick, clip.duration_tick);
  assertOverlapPolicy(track, id, startTick, clip.duration_tick);
  track.clips ??= [];
  track.clips.push({ ...structuredClone(clip), id, start_tick: startTick });
  return id;
}

export function automationOptions(
  bundle: ProjectBundle,
  arrangement: ArrangementDocument,
): ArrangementAutomationOption[] {
  const existing = new Set(
    arrangement.tracks.flatMap((track) =>
      (track.automation_lanes ?? []).map((lane) => automationTargetKey(lane.target)),
    ),
  );
  const options: ArrangementAutomationOption[] = [];
  const masterTarget = { scope: "global" as const, parameter_id: "master_dimmer" as const };
  if (!existing.has(automationTargetKey(masterTarget))) {
    options.push({
      target: masterTarget,
      definition: MASTER_DIMMER_DEFINITION,
      initialValue: structuredClone(MASTER_DIMMER_DEFINITION.default_value),
      label: "Global · Master dimmer",
    });
  }

  for (const track of arrangement.tracks) {
    for (const clip of track.clips ?? []) {
      const cue = exactAsset(bundle.cues, clip.cue_ref);
      if (!cue) continue;
      for (const layer of cue.layers) {
        const effect = exactAsset(bundle.effects, layer.effect_ref);
        if (!effect) continue;
        for (const definition of effect.parameters) {
          const target = {
            scope: "cue_layer" as const,
            clip_id: clip.id,
            layer_id: layer.id,
            parameter_id: definition.id,
          };
          if (existing.has(automationTargetKey(target))) continue;
          options.push({
            target,
            definition,
            initialValue: structuredClone(
              layer.parameter_overrides?.[definition.id] ?? definition.default_value,
            ),
            label: `${cue.name} · ${layer.id} · ${definition.name}`,
          });
        }
      }
    }
  }
  return options.sort((left, right) => left.label.localeCompare(right.label));
}

export function resolveAutomationOption(
  bundle: ProjectBundle,
  arrangement: ArrangementDocument,
  target: ArrangementAutomationTarget,
): ArrangementAutomationOption | undefined {
  if (target.scope === "global") {
    return target.parameter_id === "master_dimmer"
      ? {
          target,
          definition: MASTER_DIMMER_DEFINITION,
          initialValue: structuredClone(MASTER_DIMMER_DEFINITION.default_value),
          label: "Global · Master dimmer",
        }
      : undefined;
  }
  const clip = arrangement.tracks
    .flatMap((track) => track.clips ?? [])
    .find((candidate) => candidate.id === target.clip_id);
  const cue = clip ? exactAsset(bundle.cues, clip.cue_ref) : undefined;
  const layer = cue?.layers.find((candidate) => candidate.id === target.layer_id);
  const effect = layer ? exactAsset(bundle.effects, layer.effect_ref) : undefined;
  const definition = effect?.parameters.find((candidate) => candidate.id === target.parameter_id);
  if (!clip || !cue || !layer || !definition) return undefined;
  return {
    target,
    definition,
    initialValue: structuredClone(
      layer.parameter_overrides?.[definition.id] ?? definition.default_value,
    ),
    label: `${cue.name} · ${layer.id} · ${definition.name}`,
  };
}

export function addAutomationLane(
  arrangement: ArrangementDocument,
  trackId: string,
  option: ArrangementAutomationOption,
  startTick: number,
) {
  const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
  if (!track) {
    throw timelineError(
      "ARRANGEMENT_TRACK_MISSING",
      `CueTrack ${trackId} is no longer present.`,
      "Select an existing track and retry the action.",
    );
  }
  if (
    arrangement.tracks.some((candidate) =>
      candidate.automation_lanes?.some(
        (lane) => automationTargetKey(lane.target) === automationTargetKey(option.target),
      ),
    )
  ) {
    throw timelineError(
      "ARRANGEMENT_AUTOMATION_DUPLICATE",
      "This typed automation target already has a lane.",
      "Edit the existing lane or select a different parameter.",
    );
  }
  if (arrangement.length_ticks < 2) {
    throw timelineError(
      "ARRANGEMENT_AUTOMATION_RANGE_INVALID",
      "Arrangement is too short for a two-keyframe automation lane.",
      "Increase Arrangement length to at least two ticks.",
    );
  }
  const firstTick = Math.min(arrangement.length_ticks - 2, Math.max(0, Math.floor(startTick)));
  const lastTick = Math.min(arrangement.length_ticks - 1, firstTick + arrangement.ppq * 4);
  track.automation_lanes ??= [];
  const lane: ArrangementAutomationLane = {
    id: uniqueId(
      "automation",
      arrangement.tracks.flatMap((item) => item.automation_lanes ?? []),
    ),
    target: structuredClone(option.target),
    keyframes: [
      {
        id: "start",
        time_tick: firstTick,
        value: structuredClone(option.initialValue),
        interpolation: option.definition.automation === "discrete" ? "hold" : "linear",
      },
      {
        id: "end",
        time_tick: lastTick,
        value: structuredClone(option.initialValue),
        interpolation: "hold",
      },
    ],
  };
  lane.keyframes[0].id = uniqueId(`${lane.id}-keyframe`, lane.keyframes);
  lane.keyframes[1].id = uniqueId(`${lane.id}-keyframe`, lane.keyframes);
  track.automation_lanes.push(lane);
  return lane.id;
}

export function addAutomationKeyframe(
  arrangement: ArrangementDocument,
  trackId: string,
  laneId: string,
  timeTick: number,
  value: ParameterValueDSL,
  interpolation: KeyframeInterpolationDSL,
) {
  const lane = findLane(arrangement, trackId, laneId);
  validateKeyframeTick(arrangement, lane, timeTick);
  lane.keyframes.push({
    id: uniqueId(`${lane.id}-keyframe`, lane.keyframes),
    time_tick: timeTick,
    value: structuredClone(value),
    interpolation,
  });
  lane.keyframes.sort((left, right) => left.time_tick - right.time_tick);
}

export function moveAutomationKeyframes(
  arrangement: ArrangementDocument,
  trackId: string,
  laneId: string,
  keyframeIds: string[],
  deltaTick: number,
) {
  const lane = findLane(arrangement, trackId, laneId);
  const selected = new Set(keyframeIds);
  if (selected.size === 0) return;
  const nextTicks = lane.keyframes.map((keyframe) =>
    selected.has(keyframe.id) ? keyframe.time_tick + deltaTick : keyframe.time_tick,
  );
  if (
    nextTicks.some(
      (tick) => !Number.isInteger(tick) || tick < 0 || tick >= arrangement.length_ticks,
    ) ||
    new Set(nextTicks).size !== nextTicks.length
  ) {
    throw timelineError(
      "ARRANGEMENT_KEYFRAME_MOVE_INVALID",
      "The keyframe move would leave the Arrangement or collide with another keyframe.",
      "Move within the ruler and keep keyframes on distinct ticks.",
    );
  }
  lane.keyframes.forEach((keyframe, index) => {
    keyframe.time_tick = nextTicks[index];
  });
  lane.keyframes.sort((left, right) => left.time_tick - right.time_tick);
}

export function updateAutomationKeyframe(
  arrangement: ArrangementDocument,
  trackId: string,
  laneId: string,
  keyframeId: string,
  changes: Partial<Pick<KeyframeDSL, "time_tick" | "value" | "interpolation">>,
) {
  const lane = findLane(arrangement, trackId, laneId);
  const keyframe = lane.keyframes.find((candidate) => candidate.id === keyframeId);
  if (!keyframe) throw missingKeyframe(keyframeId);
  if (changes.time_tick !== undefined && changes.time_tick !== keyframe.time_tick) {
    validateKeyframeTick(arrangement, lane, changes.time_tick, keyframeId);
  }
  Object.assign(keyframe, structuredClone(changes));
  lane.keyframes.sort((left, right) => left.time_tick - right.time_tick);
}

export function deleteAutomationKeyframes(
  arrangement: ArrangementDocument,
  trackId: string,
  laneId: string,
  keyframeIds: string[],
) {
  const lane = findLane(arrangement, trackId, laneId);
  const selected = new Set(keyframeIds);
  const selectedCount = lane.keyframes.filter((keyframe) => selected.has(keyframe.id)).length;
  if (lane.keyframes.length - selectedCount < 1) {
    throw timelineError(
      "ARRANGEMENT_KEYFRAME_REQUIRED",
      "An automation lane must retain at least one keyframe.",
      "Keep one keyframe or delete the entire lane.",
    );
  }
  lane.keyframes = lane.keyframes.filter((keyframe) => !selected.has(keyframe.id));
}

export function deleteAutomationLane(
  arrangement: ArrangementDocument,
  trackId: string,
  laneId: string,
) {
  const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
  if (!track?.automation_lanes?.some((lane) => lane.id === laneId)) {
    throw timelineError(
      "ARRANGEMENT_AUTOMATION_MISSING",
      `AutomationLane ${laneId} is no longer present.`,
      "Select an existing automation lane and retry.",
    );
  }
  track.automation_lanes = track.automation_lanes.filter((lane) => lane.id !== laneId);
}

export function automationTargetKey(target: ArrangementAutomationTarget) {
  return target.scope === "global"
    ? `global:${target.parameter_id}`
    : `cue_layer:${target.clip_id}:${target.layer_id}:${target.parameter_id}`;
}

function findLane(arrangement: ArrangementDocument, trackId: string, laneId: string) {
  const lane = arrangement.tracks
    .find((track) => track.id === trackId)
    ?.automation_lanes?.find((candidate) => candidate.id === laneId);
  if (!lane) {
    throw timelineError(
      "ARRANGEMENT_AUTOMATION_MISSING",
      `AutomationLane ${laneId} is no longer present.`,
      "Select an existing automation lane and retry.",
    );
  }
  return lane;
}

function validateClipRange(
  arrangement: ArrangementDocument,
  startTick: number,
  durationTick: number,
) {
  if (
    !Number.isInteger(startTick) ||
    startTick < 0 ||
    !Number.isInteger(durationTick) ||
    durationTick < 1 ||
    startTick + durationTick > arrangement.length_ticks
  ) {
    throw timelineError(
      "ARRANGEMENT_CLIP_RANGE_INVALID",
      "CueClip start and duration must define a non-empty range inside the Arrangement.",
      "Move or resize the CueClip so its end stays inside the ruler.",
    );
  }
}

function assertOverlapPolicy(
  track: ArrangementDocument["tracks"][number],
  clipId: string,
  startTick: number,
  durationTick: number,
) {
  if (track.overlap_policy !== "reject") return;
  const endTick = startTick + durationTick;
  const overlap = track.clips?.find(
    (candidate) =>
      candidate.id !== clipId &&
      startTick < candidate.start_tick + candidate.duration_tick &&
      endTick > candidate.start_tick,
  );
  if (overlap) {
    throw timelineError(
      "ARRANGEMENT_CLIP_OVERLAP_REJECTED",
      `CueTrack ${track.name} rejects overlap with ${overlap.id}.`,
      "Move the CueClip to an empty range or change the track overlap policy explicitly.",
    );
  }
}

function validateKeyframeTick(
  arrangement: ArrangementDocument,
  lane: ArrangementAutomationLane,
  timeTick: number,
  exceptId?: string,
) {
  if (
    !Number.isInteger(timeTick) ||
    timeTick < 0 ||
    timeTick >= arrangement.length_ticks ||
    lane.keyframes.some((keyframe) => keyframe.id !== exceptId && keyframe.time_tick === timeTick)
  ) {
    throw timelineError(
      "ARRANGEMENT_KEYFRAME_TICK_INVALID",
      "Automation keyframes must use distinct integer ticks inside the Arrangement.",
      "Choose an unoccupied tick before the Arrangement end.",
    );
  }
}

function uniqueId(prefix: string, existing: Array<{ id: string }>) {
  const ids = new Set(existing.map((item) => item.id));
  let id = prefix;
  let suffix = 2;
  while (ids.has(id)) id = `${prefix}-${suffix++}`;
  return id;
}

function missingKeyframe(id: string) {
  return timelineError(
    "ARRANGEMENT_KEYFRAME_MISSING",
    `Keyframe ${id} is no longer present.`,
    "Select an existing keyframe and retry.",
  );
}

function timelineError(code: string, message: string, hint: string) {
  return new ArrangementTimelineError(code, message, hint);
}
