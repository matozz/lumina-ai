import { beforeEach, describe, expect, it } from "vitest";
import type { ArrangementDocument, ProjectBundle } from "@/bridge/types";
import { createCueAsset, createEffectAsset } from "@/document/projectModel";
import { projectActions, useProjectStore } from "@/stores/project";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import {
  addAutomationKeyframe,
  addAutomationLane,
  automationOptions,
  deleteCueClip,
  moveAutomationKeyframes,
  moveCueClip,
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

  it("enforces reject overlap policy with a recoverable diagnostic", () => {
    arrangement.tracks[0].overlap_policy = "reject";
    arrangement.tracks[0].clips?.push({
      id: "clip-b",
      cue_ref: { id: "cue-b", revision: 1 },
      start_tick: 4_000,
      duration_tick: 1_000,
    });
    expect(() => moveCueClip(arrangement, "clip-a", 3_900)).toThrow(/rejects overlap/);
  });

  it("resolves typed global and CueLayer parameters and removes dependent lanes with a clip", () => {
    const effect = createEffectAsset(bundle, "Pulse");
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

  it("adds, moves, and edits a typed automation curve without duplicate ticks", () => {
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
    expect(() => moveAutomationKeyframes(arrangement, "cues", laneId, [middle.id], -2_160)).toThrow(
      /collide/,
    );
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
