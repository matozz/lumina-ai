import type {
  ArrangementAutomationLane,
  ArrangementDocument,
  CueClip,
  KeyframeDSL,
} from "@/bridge/types";

export const HOUSE_REFERENCE_PPQ = 960;
export const HOUSE_REFERENCE_BAR_TICKS = HOUSE_REFERENCE_PPQ * 4;
export const HOUSE_REFERENCE_LENGTH_TICKS = HOUSE_REFERENCE_BAR_TICKS * 64;
export const HOUSE_REFERENCE_EDITED_END_TICK = HOUSE_REFERENCE_BAR_TICKS * 28;

export function createHouseArrangementReference(): ArrangementDocument {
  const dropA = beatPattern("drop-a", 18 * HOUSE_REFERENCE_BAR_TICKS, 16);
  const dropB = beatPattern("drop-b", 24 * HOUSE_REFERENCE_BAR_TICKS + HOUSE_REFERENCE_PPQ, 15);
  const clips: CueClip[] = [
    clip("full-fade", "full-fade", 0, HOUSE_REFERENCE_BAR_TICKS * 8),
    clip(
      "full-breath",
      "full-breath",
      HOUSE_REFERENCE_BAR_TICKS * 8,
      HOUSE_REFERENCE_BAR_TICKS * 8,
    ),
    clip("rain-rise", "full-rain", HOUSE_REFERENCE_BAR_TICKS * 16, HOUSE_REFERENCE_BAR_TICKS * 2),
    ...dropA,
    clip("rain-fill", "full-rain", HOUSE_REFERENCE_BAR_TICKS * 22, HOUSE_REFERENCE_PPQ * 6),
    clip(
      "center-ping-pong",
      "center-ping-pong",
      HOUSE_REFERENCE_BAR_TICKS * 23 + HOUSE_REFERENCE_PPQ * 2,
      HOUSE_REFERENCE_PPQ,
    ),
    clip(
      "center-pulse",
      "center-pulse",
      HOUSE_REFERENCE_BAR_TICKS * 23 + HOUSE_REFERENCE_PPQ * 3,
      HOUSE_REFERENCE_PPQ / 2,
    ),
    clip(
      "edge-pulse",
      "edge-pulse",
      HOUSE_REFERENCE_BAR_TICKS * 23 + HOUSE_REFERENCE_PPQ * 3.5,
      HOUSE_REFERENCE_PPQ / 2,
    ),
    clip("gentle-breathe", "gentle-breathe", HOUSE_REFERENCE_BAR_TICKS * 24, HOUSE_REFERENCE_PPQ),
    ...dropB,
  ];

  return {
    schema_version: 1,
    id: "house-128-custom-reference",
    revision: 2,
    name: "House 128 Custom Reference",
    ppq: HOUSE_REFERENCE_PPQ,
    tempo_map: { points: [{ time_tick: 0, bpm: 132 }] },
    time_signatures: [{ time_tick: 0, numerator: 4, denominator: 4 }],
    length_ticks: HOUSE_REFERENCE_LENGTH_TICKS,
    tracks: [
      {
        id: "cues",
        name: "Cues",
        overlap_policy: "layer",
        clips,
        automation_lanes: automationLanes(),
      },
    ],
    markers: [],
  };
}

function clip(id: string, cueId: string, startTick: number, durationTick: number): CueClip {
  return {
    id,
    cue_ref: { id: cueId, revision: 1 },
    start_tick: startTick,
    duration_tick: durationTick,
    source_offset_tick: 0,
    playback: "loop",
    layer: 0,
    layer_overrides: [],
  };
}

function beatPattern(prefix: string, startTick: number, count: number): CueClip[] {
  return Array.from({ length: count }, (_, index) =>
    clip(
      `${prefix}-${String(index + 1).padStart(2, "0")}`,
      index % 2 === 0 ? "full-bloom" : "full-flash",
      startTick + index * HOUSE_REFERENCE_PPQ,
      HOUSE_REFERENCE_PPQ,
    ),
  );
}

function automationLanes(): ArrangementAutomationLane[] {
  const bar9 = HOUSE_REFERENCE_BAR_TICKS * 8;
  const bar13 = HOUSE_REFERENCE_BAR_TICKS * 12;
  const bar15 = HOUSE_REFERENCE_BAR_TICKS * 14;
  const bar16 = HOUSE_REFERENCE_BAR_TICKS * 15;
  const bar17 = HOUSE_REFERENCE_BAR_TICKS * 16;
  const bar19 = HOUSE_REFERENCE_BAR_TICKS * 18;
  const bar23 = HOUSE_REFERENCE_BAR_TICKS * 22;
  const bar24 = HOUSE_REFERENCE_BAR_TICKS * 23;
  return [
    lane("full-breath-speed", "full-breath", "layer-breath", "speed", [
      scalarKeyframe("bar-09", bar9, 0.5),
      scalarKeyframe("bar-13-hold", bar13, 0.5),
      scalarKeyframe("bar-13-rise", bar13 + 1, 1),
      scalarKeyframe("bar-15-hold", bar15, 1),
      scalarKeyframe("bar-15-rise", bar15 + 1, 2),
      scalarKeyframe("bar-17", bar17, 2),
    ]),
    lane("full-breath-intensity", "full-breath", "layer-breath", "intensity", [
      scalarKeyframe("bar-13", bar13, 0.7),
      scalarKeyframe("bar-16", bar16, 1),
      scalarKeyframe("bar-17", bar17, 1),
    ]),
    lane("rain-rise-intensity", "rain-rise", "layer-rain", "intensity", [
      scalarKeyframe("bar-17", bar17, 0),
      scalarKeyframe("bar-19", bar19, 1),
    ]),
    lane("rain-fill-speed", "rain-fill", "layer-rain", "speed", [
      scalarKeyframe("bar-23", bar23, 0.5),
      scalarKeyframe("bar-24-hold", bar24, 0.5),
      scalarKeyframe("bar-24-rise", bar24 + 1, 1),
      scalarKeyframe("bar-24-beat-3", bar24 + HOUSE_REFERENCE_PPQ * 2, 1),
    ]),
  ];
}

function lane(
  id: string,
  clipId: string,
  layerId: string,
  parameterId: string,
  keyframes: KeyframeDSL[],
): ArrangementAutomationLane {
  return {
    id,
    target: {
      scope: "cue_layer",
      clip_id: clipId,
      layer_id: layerId,
      parameter_id: parameterId,
    },
    keyframes,
  };
}

function scalarKeyframe(id: string, timeTick: number, value: number): KeyframeDSL {
  return {
    id,
    time_tick: timeTick,
    value: { type: "scalar", value },
    interpolation: "linear",
  };
}
