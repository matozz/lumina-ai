import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  ArrangementAutomationLane,
  AssetRef,
  CueClip,
  CueDefinition,
  KeyframeDSL,
  UserAssetPack,
} from "@/bridge/types";
import { createBaseAssetPack, validateUserAssetPack } from "@/document/userAssetPack";

const fixtureDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "files");
const baseFixturePath = resolve(fixtureDirectory, "base-assets.lumina-assets.json");
const projectFixturePath = resolve(
  fixtureDirectory,
  "house-128-custom-project-pack.lumina-assets.json",
);

describe("lumina-full-arrange eval fixtures", () => {
  it("match the current deterministic UserAssetPack V1 contract", () => {
    const expectedBase = createBaseAssetPack();
    const expectedProject = createProjectPack(expectedBase);

    if (process.env.UPDATE_LUMINA_SKILL_FIXTURES === "1") {
      mkdirSync(fixtureDirectory, { recursive: true });
      writeJson(baseFixturePath, expectedBase);
      writeJson(projectFixturePath, expectedProject);
    }

    const base = readJson(baseFixturePath);
    const project = readJson(projectFixturePath);
    expect(base).toEqual(expectedBase);
    expect(project).toEqual(expectedProject);
    expect(validateUserAssetPack(base)).toMatchObject({ success: true, issues: [] });
    expect(validateUserAssetPack(project)).toMatchObject({ success: true, issues: [] });
  });
});

function createProjectPack(base: UserAssetPack): UserAssetPack {
  const ppq = 960;
  const barTicks = ppq * 4;
  const stage = structuredClone(base.stages[0]);
  const cues = [
    projectCue(
      "project.cue.zone-one-ping-pong",
      "Zone One Ping-Pong",
      "layer_project_zone_one",
      "builtin.spatial.column-ping-pong",
      "zone-2x2-1",
      { speed: { type: "scalar", value: 1 }, intensity: { type: "scalar", value: 0.9 } },
    ),
    projectCue(
      "project.cue.zone-two-rain",
      "Zone Two Rain",
      "layer_project_zone_two",
      "builtin.spatial.column-rain",
      "zone-2x2-2",
      { speed: { type: "scalar", value: 1 }, intensity: { type: "scalar", value: 0.85 } },
    ),
    projectCue(
      "project.cue.zone-three-gradient",
      "Zone Three Gradient",
      "layer_project_zone_three",
      "builtin.color.dual-sweep",
      "zone-2x2-3",
      { speed: { type: "scalar", value: 1 }, phase: { type: "scalar", value: 0 } },
    ),
    projectCue(
      "project.cue.zone-four-breathe",
      "Zone Four Breathe",
      "layer_project_zone_four",
      "builtin.intensity.breathe",
      "zone-2x2-4",
      { speed: { type: "scalar", value: 1 }, intensity: { type: "scalar", value: 0.7 } },
    ),
  ] satisfies CueDefinition[];
  const cueById = new Map(cues.map((cue) => [cue.id, cue]));
  const clips: CueClip[] = [
    clip("foundation", cues[0].id, 0, 8 * barTicks),
    clip("buildup", cues[0].id, 8 * barTicks, 8 * barTicks),
    ...Array.from({ length: 35 }, (_, index) =>
      clip(
        `alternating-drop-${String(index + 1).padStart(2, "0")}`,
        cues[index % 4].id,
        16 * barTicks + index * ppq,
        ppq,
      ),
    ),
    clip("transition", cues[0].id, 16 * barTicks + 35 * ppq, 5 * ppq),
    clip("recovery", cues[3].id, 26 * barTicks, 2 * barTicks),
  ];

  const automationLanes: ArrangementAutomationLane[] = [
    lane("foundation-speed", clips[0], cueById, "speed", [
      scalarKeyframe("foundation-speed-start", 0, 0.5),
      scalarKeyframe("foundation-speed-end", 8 * barTicks - 1, 1),
    ]),
    lane("buildup-intensity", clips[1], cueById, "intensity", [
      scalarKeyframe("buildup-intensity-start", 8 * barTicks, 0.4),
      scalarKeyframe("buildup-intensity-end", 16 * barTicks - 1, 1),
    ]),
    lane("transition-speed", clips[37], cueById, "speed", [
      scalarKeyframe("transition-speed-start", clips[37].start_tick, 2),
      scalarKeyframe("transition-speed-end", clipEnd(clips[37]) - 1, 0.5),
    ]),
    lane("recovery-intensity", clips[38], cueById, "intensity", [
      scalarKeyframe("recovery-intensity-start", clips[38].start_tick, 0.7),
      scalarKeyframe("recovery-intensity-end", clipEnd(clips[38]) - 1, 0.2),
    ]),
  ];

  const usedCueIds = new Set(clips.map((item) => item.cue_ref.id));
  const usedCues = cues.filter((cue) => usedCueIds.has(cue.id));
  const usedEffectRefs = new Map<string, AssetRef>();
  for (const cue of usedCues) {
    for (const layer of cue.layers) {
      usedEffectRefs.set(`${layer.effect_ref.id}@${layer.effect_ref.revision}`, layer.effect_ref);
    }
  }
  const usedEffects = base.effects.filter((effect) =>
    usedEffectRefs.has(`${effect.id}@${effect.revision}`),
  );
  const layout = structuredClone(
    base.layouts.find(
      (candidate) =>
        candidate.id === stage.layout_ref.id && candidate.revision === stage.layout_ref.revision,
    )!,
  );

  return {
    schema_version: 1,
    id: "asset-pack-house-128-custom-reference",
    name: "House 128 Custom Project Pack",
    source_project_id: "project.house-128-custom-reference",
    stages: [stage],
    layouts: [layout],
    effects: structuredClone(usedEffects),
    cues: structuredClone(usedCues),
    arrangements: [
      {
        schema_version: 1,
        id: "project.arrangement.house-128-custom",
        revision: 2,
        name: "House 128 Custom",
        ppq,
        tempo_map: { points: [{ time_tick: 0, bpm: 132 }] },
        time_signatures: [{ time_tick: 0, numerator: 4, denominator: 4 }],
        length_ticks: 64 * barTicks,
        tracks: [
          {
            id: "cues",
            name: "Cues",
            overlap_policy: "layer",
            clips,
            automation_lanes: automationLanes,
          },
        ],
        markers: [
          { id: "foundation", name: "Foundation", time_tick: 0 },
          { id: "buildup", name: "Buildup", time_tick: 8 * barTicks },
          { id: "alternating-drop", name: "Alternating Drop", time_tick: 16 * barTicks },
          { id: "transition", name: "Transition", time_tick: 24 * barTicks },
          { id: "empty-tail", name: "Unconfirmed Empty Tail", time_tick: 28 * barTicks },
        ],
      },
    ],
  };
}

function projectCue(
  id: string,
  name: string,
  layerId: string,
  effectId: string,
  targetSetId: string,
  parameterOverrides: CueDefinition["layers"][number]["parameter_overrides"],
): CueDefinition {
  return {
    schema_version: 1,
    id,
    revision: 1,
    name,
    compatible_stage_ref: { id: "main-stage", revision: 1 },
    nominal_length_ticks: 7_680,
    layers: [
      {
        id: layerId,
        effect_ref: { id: effectId, revision: 1 },
        target_set_ref: {
          stage_id: "main-stage",
          stage_revision: 1,
          target_set_id: targetSetId,
        },
        parameter_overrides: parameterOverrides,
        phase: 0,
        seed: "2300000000000001",
        layer: 0,
        priority: 0,
        trigger_policy: { mode: "timeline", quantize: "beat" },
      },
    ],
    trigger_policy: { mode: "timeline", quantize: "beat" },
    capability_summary: { required_attributes: ["intensity"] },
    risk_summary: { strobe_risk: "none" },
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

function lane(
  id: string,
  targetClip: CueClip,
  cueById: Map<string, CueDefinition>,
  parameterId: string,
  keyframes: KeyframeDSL[],
): ArrangementAutomationLane {
  const cue = cueById.get(targetClip.cue_ref.id)!;
  const layer = cue.layers.find(
    (candidate) => parameterId in (candidate.parameter_overrides ?? {}),
  )!;
  return {
    id,
    target: {
      scope: "cue_layer",
      clip_id: targetClip.id,
      layer_id: layer.id,
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

function clipEnd(item: CueClip) {
  return item.start_tick + item.duration_tick;
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}
