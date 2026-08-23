import { beforeEach, describe, expect, it } from "vitest";
import type { ArrangementDocument } from "@/bridge/types";
import { exactAsset } from "@/document/projectModel";
import { projectActions, useProjectStore } from "@/stores/project";
import {
  deleteArrangementSelection,
  moveArrangementSelection,
  resizeArrangementSelection,
} from "./arrangementBulkCommands";
import { createHouseArrangementReference } from "./houseArrangementReference";
import type { ArrangementTimelineSelection } from "./arrangementSelection";

describe("Arrangement bulk commands", () => {
  it("moves multiple clips and their associated automation while preserving relative semantics", () => {
    const arrangement = createHouseArrangementReference();
    const selection = clipSelection("full-breath", "rain-rise");
    const before = structuredClone(arrangement);

    moveArrangementSelection(arrangement, selection, 960);

    const clips = arrangement.tracks[0].clips ?? [];
    expect(clips.find((clip) => clip.id === "full-breath")?.start_tick).toBe(31_680);
    expect(clips.find((clip) => clip.id === "rain-rise")?.start_tick).toBe(62_400);
    expect(clips.find((clip) => clip.id === "full-breath")?.layer).toBe(0);
    expect(
      arrangement.tracks[0].automation_lanes?.find((lane) => lane.id === "full-breath-speed")
        ?.keyframes[0].time_tick,
    ).toBe(31_680);
    expect(
      (clips.find((clip) => clip.id === "rain-rise")?.start_tick ?? 0) -
        (clips.find((clip) => clip.id === "full-breath")?.start_tick ?? 0),
    ).toBe(
      (before.tracks[0].clips?.find((clip) => clip.id === "rain-rise")?.start_tick ?? 0) -
        (before.tracks[0].clips?.find((clip) => clip.id === "full-breath")?.start_tick ?? 0),
    );
  });

  it("allows a group move to overlap regardless of legacy track policy metadata", () => {
    const arrangement = legacyRejectArrangement();

    moveArrangementSelection(arrangement, clipSelection("clip-a"), 1_440);

    expect(arrangement.tracks[0].clips?.find((clip) => clip.id === "clip-a")?.start_tick).toBe(
      1_440,
    );
  });

  it("moves keyframes across lanes, permits same-tick stacks, and rejects invalid ranges", () => {
    const arrangement = createHouseArrangementReference();
    const selection: ArrangementTimelineSelection = {
      anchor: null,
      primary: null,
      items: [
        { type: "keyframe", trackId: "cues", laneId: "full-breath-speed", keyframeId: "bar-09" },
        {
          type: "keyframe",
          trackId: "cues",
          laneId: "full-breath-intensity",
          keyframeId: "bar-13",
        },
      ],
    };

    moveArrangementSelection(arrangement, selection, 240);
    expect(
      arrangement.tracks[0].automation_lanes?.find((lane) => lane.id === "full-breath-speed")
        ?.keyframes[0].time_tick,
    ).toBe(30_960);

    moveArrangementSelection(arrangement, selection, 15_120);
    expect(
      arrangement.tracks[0].automation_lanes
        ?.find((lane) => lane.id === "full-breath-speed")
        ?.keyframes.filter((keyframe) => keyframe.time_tick === 46_080),
    ).toHaveLength(2);

    const before = structuredClone(arrangement);
    expect(() =>
      moveArrangementSelection(arrangement, selection, arrangement.length_ticks),
    ).toThrow(/invalid tick/);
    expect(arrangement).toEqual(before);
  });

  it("keeps one keyframe per lane and disallows mixed resize selections", () => {
    const arrangement = createHouseArrangementReference();
    const lane = arrangement.tracks[0].automation_lanes?.find(
      (candidate) => candidate.id === "rain-rise-intensity",
    )!;
    const selection: ArrangementTimelineSelection = {
      anchor: null,
      primary: null,
      items: lane.keyframes.map((keyframe) => ({
        type: "keyframe" as const,
        trackId: "cues",
        laneId: lane.id,
        keyframeId: keyframe.id,
      })),
    };

    expect(() => deleteArrangementSelection(arrangement, selection)).toThrow(/retain one/);
    expect(() =>
      resizeArrangementSelection(
        arrangement,
        {
          ...selection,
          items: [{ type: "clip", trackId: "cues", clipId: "full-fade" }, ...selection.items],
        },
        480,
      ),
    ).toThrow(/only when/);
  });
});

describe("Arrangement bulk history", () => {
  beforeEach(() => projectActions.reset());

  it("deletes a multi-selection and restores it with one Undo transaction", () => {
    const effect = projectActions.createEffect("Bulk")!;
    const cue = projectActions.createCue([effect], "Bulk Cue")!;
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Seed bulk clips", (arrangement) => {
      arrangement.tracks[0].clips = [
        { id: "clip-a", cue_ref: cue, start_tick: 0, duration_tick: 960 },
        { id: "clip-b", cue_ref: cue, start_tick: 960, duration_tick: 960 },
      ];
    });
    const workingRef = useProjectStore.getState().selectedArrangementRef;
    const historyBefore = useProjectStore.getState().historyCursor;

    projectActions.updateArrangement(workingRef, "Delete timeline selection", (arrangement) => {
      deleteArrangementSelection(arrangement, clipSelection("clip-a", "clip-b"));
    });

    expect(useProjectStore.getState().historyCursor).toBe(historyBefore + 1);
    projectActions.undo();
    const state = useProjectStore.getState();
    expect(
      exactAsset(state.bundle.arrangements, state.selectedArrangementRef)?.tracks[0].clips,
    ).toHaveLength(2);
  });
});

function clipSelection(...clipIds: string[]): ArrangementTimelineSelection {
  return {
    anchor: null,
    primary: null,
    items: clipIds.map((clipId) => ({ type: "clip", trackId: "cues", clipId })),
  };
}

function legacyRejectArrangement(): ArrangementDocument {
  const arrangement = createHouseArrangementReference();
  arrangement.tracks[0].overlap_policy = "reject";
  arrangement.tracks[0].clips = [
    { id: "clip-a", cue_ref: { id: "a", revision: 1 }, start_tick: 0, duration_tick: 960 },
    { id: "clip-b", cue_ref: { id: "b", revision: 1 }, start_tick: 2_000, duration_tick: 960 },
  ];
  arrangement.tracks[0].automation_lanes = [];
  return arrangement;
}
