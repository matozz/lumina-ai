import { beforeEach, describe, expect, it } from "vitest";
import type { ArrangementDocument, ProjectBundle } from "@/bridge/types";
import { createCueAsset, createEffectAsset } from "@/document/projectModel";
import { projectActions, useProjectStore } from "@/stores/project";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import {
  addAutomationKeyframe,
  addAutomationLane,
  automationOptionsForClip,
  automationOptions,
  automationLaneValueAtTick,
  cueTrackVisualLayout,
  deleteCueClip,
  ensureAutomationAtTick,
  moveAutomationKeyframes,
  moveCueClip,
  resolveAutomationOption,
  resizeCueClip,
  updateAutomationKeyframe,
  visibleCueClips,
} from "./arrangementTimelineModel";

describe("Arrangement timeline model", () => {
  let bundle: ProjectBundle;
  let arrangement: ArrangementDocument;

  beforeEach(() => {
    bundle = createStarterProjectBundle();
    arrangement = bundle.arrangements.find(
      (candidate) => candidate.id === bundle.manifest.active_arrangement_id,
    )!;
    arrangement.tracks[0].clips = [
      {
        id: "clip-a",
        cue_ref: { id: "cue-a", revision: 1 },
        start_tick: 960,
        duration_tick: 1_920,
      },
    ];
  });

  it("moves and resizes CueClip ranges while rejecting out-of-range edits", () => {
    moveCueClip(arrangement, "clip-a", 1_920);
    resizeCueClip(arrangement, "clip-a", 3_840);
    expect(arrangement.tracks[0].clips?.[0]).toMatchObject({
      start_tick: 1_920,
      duration_tick: 3_840,
    });
    expect(() => resizeCueClip(arrangement, "clip-a", arrangement.length_ticks + 1)).toThrow(
      /inside/,
    );
  });

  it("allows overlap regardless of legacy track policy metadata", () => {
    arrangement.tracks[0].overlap_policy = "reject";
    arrangement.tracks[0].clips?.push({
      id: "clip-b",
      cue_ref: { id: "cue-b", revision: 1 },
      start_tick: 4_000,
      duration_tick: 1_000,
    });
    moveCueClip(arrangement, "clip-a", 3_900);
    expect(arrangement.tracks[0].clips?.[0].start_tick).toBe(3_900);
  });

  it("keeps semantic layers separate and packs same-layer overlaps into extra visual rows", () => {
    const layout = cueTrackVisualLayout([
      {
        id: "layer-0-a",
        cue_ref: { id: "cue-a", revision: 1 },
        start_tick: 0,
        duration_tick: 1_920,
        layer: 0,
      },
      {
        id: "layer-0-overlap",
        cue_ref: { id: "cue-b", revision: 1 },
        start_tick: 960,
        duration_tick: 1_920,
        layer: 0,
      },
      {
        id: "layer-0-follow",
        cue_ref: { id: "cue-c", revision: 1 },
        start_tick: 2_880,
        duration_tick: 960,
        layer: 0,
      },
      {
        id: "layer-3",
        cue_ref: { id: "cue-d", revision: 1 },
        start_tick: 0,
        duration_tick: 960,
        layer: 3,
      },
    ]);

    expect(layout.layerCount).toBe(2);
    expect(layout.rowCount).toBe(3);
    expect(layout.placements.get("layer-0-a")).toMatchObject({ row: 0, subrow: 0 });
    expect(layout.placements.get("layer-0-overlap")).toMatchObject({ row: 1, subrow: 1 });
    expect(layout.placements.get("layer-0-follow")).toMatchObject({ row: 0, subrow: 0 });
    expect(layout.placements.get("layer-3")).toMatchObject({ row: 2, semanticLayer: 3 });
  });

  it("resolves typed global and CueLayer parameters and removes dependent lanes with a clip", () => {
    const effect = createEffectAsset(bundle, "Pulse");
    effect.parameters[0].scope = "arrangement";
    bundle.effects.push(effect);
    const cue = createCueAsset(bundle, [{ id: effect.id, revision: effect.revision }], "Cue A");
    cue.id = "cue-a";
    bundle.cues.push(cue);
    const options = automationOptions(bundle, arrangement);
    expect(options.some((option) => option.target.scope === "global")).toBe(true);
    const cueLayer = options.find((option) => option.target.scope === "cue_layer")!;
    const laneId = addAutomationLane(arrangement, "cues", cueLayer, 960);
    expect(arrangement.tracks[0].automation_lanes?.[0].target).toEqual(cueLayer.target);

    deleteCueClip(arrangement, "clip-a");
    expect(arrangement.tracks[0].automation_lanes?.some((lane) => lane.id === laneId)).toBe(false);
  });

  it("presents a single-layer automation target without its raw layer ID", () => {
    const effect = createEffectAsset(bundle, "Pulse");
    effect.parameters[0].scope = "arrangement";
    bundle.effects.push(effect);
    const cue = createCueAsset(bundle, [{ id: effect.id, revision: effect.revision }], "Cue A");
    cue.id = "cue-a";
    bundle.cues.push(cue);

    const option = automationOptions(bundle, arrangement).find(
      (candidate) => candidate.target.scope === "cue_layer",
    )!;

    expect(option.label).toBe(`${cue.name} · ${option.definition.name}`);
    const target = structuredClone(option.target);
    cue.name = "Renamed Cue A";
    const resolved = resolveAutomationOption(bundle, arrangement, target)!;
    expect(resolved.label).toBe(`Renamed Cue A · ${option.definition.name}`);
    expect(resolved.target).toEqual(target);
  });

  it("filters Effect-only and Cue-only parameters from Arrangement automation", () => {
    const effect = createEffectAsset(bundle, "Filtered Pulse");
    effect.parameters.forEach((parameter) => {
      parameter.scope = "effect";
    });
    effect.parameters[0].scope = "arrangement";
    effect.parameters[1].scope = "cue";
    bundle.effects.push(effect);
    const cue = createCueAsset(bundle, [effect], "Filtered Cue");
    cue.id = "cue-a";
    bundle.cues.push(cue);

    const options = automationOptionsForClip(bundle, arrangement, "clip-a");

    expect(options.map((option) => option.definition.id)).toEqual([effect.parameters[0].id]);
  });

  it("scopes Arrangement automation to one CueClip even when Cue references repeat", () => {
    const effect = createEffectAsset(bundle, "Repeated FullFlash");
    effect.parameters[0].scope = "arrangement";
    bundle.effects.push(effect);
    const cue = createCueAsset(bundle, [effect], "FullFlash");
    cue.id = "cue-a";
    bundle.cues.push(cue);
    arrangement.tracks[0].clips?.push({
      id: "clip-b",
      cue_ref: { id: cue.id, revision: cue.revision },
      start_tick: 3_840,
      duration_tick: 1_920,
    });

    const first = automationOptionsForClip(bundle, arrangement, "clip-a").find(
      (option) => option.definition.id === effect.parameters[0].id,
    )!;
    const second = automationOptionsForClip(bundle, arrangement, "clip-b").find(
      (option) => option.definition.id === effect.parameters[0].id,
    )!;

    expect(first.target).toMatchObject({ scope: "cue_layer", clip_id: "clip-a" });
    expect(second.target).toMatchObject({ scope: "cue_layer", clip_id: "clip-b" });
    expect(first.target).not.toEqual(second.target);
  });

  it("creates or locates one typed lane at the exact context tick without duplicates", () => {
    const effect = createEffectAsset(bundle, "Context Pulse");
    const definition = effect.parameters[0];
    definition.scope = "arrangement";
    bundle.effects.push(effect);
    const cue = createCueAsset(bundle, [effect], "Context Cue");
    cue.id = "cue-a";
    cue.automation_lanes = [
      {
        id: "cue-speed",
        target: { layer_id: cue.layers[0].id, parameter_id: definition.id },
        keyframes: [
          {
            id: "cue-start",
            time_tick: 0,
            value: { type: "scalar", value: 0.25 },
            interpolation: "linear",
          },
          {
            id: "cue-end",
            time_tick: 960,
            value: { type: "scalar", value: 0.75 },
            interpolation: "linear",
          },
        ],
      },
    ];
    bundle.cues.push(cue);
    const option = automationOptionsForClip(bundle, arrangement, "clip-a").find(
      (candidate) => candidate.definition.id === definition.id,
    )!;

    const created = ensureAutomationAtTick(bundle, arrangement, "cues", option, 1_440);
    const lane = arrangement.tracks[0].automation_lanes?.[0]!;
    expect(lane.keyframes).toEqual([
      expect.objectContaining({
        id: created.keyframeId,
        time_tick: 1_440,
        value: { type: "scalar", value: 0.5 },
      }),
    ]);

    const located = ensureAutomationAtTick(bundle, arrangement, "cues", option, 1_440);
    expect(located).toEqual(created);
    expect(arrangement.tracks[0].automation_lanes).toHaveLength(1);
    expect(lane.keyframes).toHaveLength(1);

    const appended = ensureAutomationAtTick(bundle, arrangement, "cues", option, 1_920);
    expect(appended.laneId).toBe(created.laneId);
    expect(lane.keyframes).toHaveLength(2);
  });

  it("adds, moves, and edits an ordered same-tick automation boundary", () => {
    const option = automationOptions(bundle, arrangement)[0];
    const laneId = addAutomationLane(arrangement, "cues", option, 0);
    addAutomationKeyframe(
      arrangement,
      "cues",
      laneId,
      1_920,
      { type: "scalar", value: 0.5 },
      "linear",
    );
    const lane = arrangement.tracks[0].automation_lanes?.[0]!;
    const middle = lane.keyframes.find((keyframe) => keyframe.time_tick === 1_920)!;
    moveAutomationKeyframes(arrangement, "cues", laneId, [middle.id], 240);
    updateAutomationKeyframe(arrangement, "cues", laneId, middle.id, {
      value: { type: "scalar", value: 0.25 },
      interpolation: "ease_in_out",
    });
    expect(lane.keyframes.find((keyframe) => keyframe.id === middle.id)).toMatchObject({
      time_tick: 2_160,
      value: { type: "scalar", value: 0.25 },
      interpolation: "ease_in_out",
    });
    moveAutomationKeyframes(arrangement, "cues", laneId, [middle.id], -2_160);
    expect(lane.keyframes.map((keyframe) => keyframe.time_tick)).toEqual([0, 0]);
    expect(automationLaneValueAtTick(lane, 0, { type: "scalar", value: 1 })).toEqual({
      type: "scalar",
      value: 0.25,
    });
  });

  it("evaluates Color in Lab and hold values through the exact boundary tick", () => {
    const lane = {
      id: "color-lane",
      target: { scope: "global" as const, parameter_id: "master_dimmer" as const },
      keyframes: [
        {
          id: "red",
          time_tick: 0,
          value: { type: "color" as const, value: "#FF0000" },
          interpolation: "linear" as const,
        },
        {
          id: "blue",
          time_tick: 960,
          value: { type: "color" as const, value: "#0000FF" },
          interpolation: "hold" as const,
        },
        {
          id: "green",
          time_tick: 1_920,
          value: { type: "color" as const, value: "#00FF00" },
          interpolation: "hold" as const,
        },
      ],
    };

    expect(automationLaneValueAtTick(lane, 480, { type: "color", value: "#000000" })).toEqual(
      expect.objectContaining({ type: "color", value: expect.not.stringMatching("#800080") }),
    );
    expect(automationLaneValueAtTick(lane, 1_919, { type: "color", value: "#000000" })).toEqual({
      type: "color",
      value: "#0000FF",
    });
    expect(automationLaneValueAtTick(lane, 1_920, { type: "color", value: "#000000" })).toEqual({
      type: "color",
      value: "#00FF00",
    });
  });

  it("uses the last authored point at a same-tick instantaneous switch", () => {
    const lane = {
      id: "instant-switch",
      target: { scope: "global" as const, parameter_id: "master_dimmer" as const },
      keyframes: [
        {
          id: "start",
          time_tick: 0,
          value: { type: "scalar" as const, value: 0 },
          interpolation: "linear" as const,
        },
        {
          id: "left-limit",
          time_tick: 960,
          value: { type: "scalar" as const, value: 0.25 },
          interpolation: "linear" as const,
        },
        {
          id: "boundary",
          time_tick: 960,
          value: { type: "scalar" as const, value: 1 },
          interpolation: "hold" as const,
        },
      ],
    };

    expect(automationLaneValueAtTick(lane, 959, { type: "scalar", value: 0 })).toEqual({
      type: "scalar",
      value: 0.25 * (959 / 960),
    });
    expect(automationLaneValueAtTick(lane, 960, { type: "scalar", value: 0 })).toEqual({
      type: "scalar",
      value: 1,
    });
  });

  it("records a pointer-up style edit as one Project history transaction", () => {
    projectActions.reset();
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed clip", (draft) => {
      draft.tracks[0].clips = structuredClone(arrangement.tracks[0].clips);
    });
    const workingReference = useProjectStore.getState().selectedArrangementRef;
    const historyBefore = useProjectStore.getState().historyCursor;
    projectActions.updateArrangement(workingReference, "Move CueClip", (draft) => {
      moveCueClip(draft, "clip-a", 5_760);
    });
    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 1);
  });

  it("mounts only viewport-adjacent CueClips from a 1,000-clip Arrangement", () => {
    const clips = Array.from({ length: 1_000 }, (_, index) => ({
      id: `clip-${index}`,
      cue_ref: { id: "cue-a", revision: 1 },
      start_tick: index * 960,
      duration_tick: 480,
    }));

    expect(visibleCueClips(clips, 0, 7_680).map((clip) => clip.id)).toEqual([
      "clip-0",
      "clip-1",
      "clip-2",
      "clip-3",
      "clip-4",
      "clip-5",
      "clip-6",
      "clip-7",
      "clip-8",
    ]);
  });
});
