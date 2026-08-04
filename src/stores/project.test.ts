import { beforeEach, describe, expect, it } from "vitest";
import { assetKey, exactAsset } from "@/document/projectModel";
import { projectActions, useProjectStore } from "./project";

describe("Stage 7 Project state", () => {
  beforeEach(() => projectActions.reset());

  it("keeps per-Arrangement playhead and loop state while switching", () => {
    const house = useProjectStore.getState().selectedArrangementRef;
    projectActions.setArrangementPlayhead(house, 1_920);
    projectActions.setArrangementLoop(house, {
      loopEnabled: true,
      loopStartTick: 960,
      loopEndTick: 3_840,
    });
    const journey = projectActions.duplicateArrangement(house, "Tempo Journey");
    expect(journey).not.toBeNull();
    projectActions.setArrangementPlayhead(journey!, 7_680);
    projectActions.selectArrangement(house);

    const sessions = useProjectStore.getState().arrangementSessions;
    expect(sessions[assetKey(house)]).toMatchObject({
      playheadTick: 1_920,
      loopEnabled: true,
    });
    expect(sessions[assetKey(journey!)]?.playheadTick).toBe(7_680);
  });

  it("duplicates a multi-tempo Arrangement without moving clip or keyframe ticks", () => {
    const house = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(house, "Build House arrangement", (arrangement) => {
      arrangement.tracks[0].clips = [
        {
          id: "cue-clip",
          cue_ref: { id: "cue", revision: 1 },
          start_tick: 1_920,
          duration_tick: 3_840,
        },
      ];
      arrangement.tracks[0].automation_lanes = [
        {
          id: "master",
          target: { scope: "global", parameter_id: "master_dimmer" },
          keyframes: [
            {
              id: "start",
              time_tick: 960,
              value: { type: "scalar", value: 1 },
              interpolation: "linear",
            },
          ],
        },
      ];
    });
    const current = useProjectStore.getState().selectedArrangementRef;
    const journey = projectActions.duplicateArrangement(current, "Tempo Journey")!;
    projectActions.updateArrangement(journey, "Add tempo journey", (arrangement) => {
      arrangement.tempo_map.points.push({ time_tick: 7_680, bpm: 96 });
    });
    const state = useProjectStore.getState();
    const source = exactAsset(state.bundle.arrangements, current)!;
    const copy = exactAsset(state.bundle.arrangements, state.selectedArrangementRef)!;

    expect(copy.tempo_map.points).toHaveLength(2);
    expect(copy.tracks[0].clips?.[0].start_tick).toBe(source.tracks[0].clips?.[0].start_tick);
    expect(copy.tracks[0].automation_lanes?.[0].keyframes[0].time_tick).toBe(
      source.tracks[0].automation_lanes?.[0].keyframes[0].time_tick,
    );
  });

  it("forks Effect and Cue revisions without silently upgrading published references", () => {
    const pulse = projectActions.createEffect("Pulse")!;
    const cue = projectActions.createCue([pulse], "Pulse Cue")!;
    const arrangement = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(arrangement, "Place Cue", (document) => {
      document.tracks[0].clips = [
        { id: "clip", cue_ref: cue, start_tick: 0, duration_tick: 3_840 },
      ];
    });
    projectActions.markPublished();

    projectActions.renameEffect(pulse, "Pulse v2");
    const effectV2 = useProjectStore.getState().selectedEffectRef!;
    expect(effectV2.revision).toBe(2);
    expect(exactAsset(useProjectStore.getState().bundle.cues, cue)?.layers[0].effect_ref).toEqual(
      pulse,
    );

    projectActions.renameCue(cue, "Pulse Cue v2");
    const cueV2 = useProjectStore.getState().selectedCueRef!;
    expect(cueV2.revision).toBe(2);
    const clip = exactAsset(useProjectStore.getState().bundle.arrangements, arrangement)?.tracks[0]
      .clips?.[0];
    expect(clip?.cue_ref).toEqual(cue);
  });

  it("undoes and redoes an Arrangement edit as one transaction", () => {
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(reference, "Tempo edit", (arrangement) => {
      arrangement.tempo_map.points[0].bpm = 132;
      arrangement.length_ticks = 61_440;
    });
    expect(
      exactAsset(useProjectStore.getState().bundle.arrangements, reference)?.tempo_map.points[0]
        .bpm,
    ).toBe(132);
    projectActions.undo();
    expect(
      exactAsset(useProjectStore.getState().bundle.arrangements, reference)?.tempo_map.points[0]
        .bpm,
    ).toBe(128);
    projectActions.redo();
    expect(
      exactAsset(useProjectStore.getState().bundle.arrangements, reference)?.length_ticks,
    ).toBe(61_440);
  });

  it("keeps Draft and Published rehearsal modes explicit and independent", () => {
    projectActions.setPreviewSource("rehearsal_published", 7);
    projectActions.setEffectPreviewPlayback("paused");
    projectActions.setCuePreviewPlayback("playing");
    projectActions.setPreviewSource("authoring_draft");

    const state = useProjectStore.getState();
    expect(state.previewSource).toBe("authoring_draft");
    expect(state.rehearsalPublishedRevision).toBeNull();
    expect(state.effectPreviewPlayback).toBe("paused");
    expect(state.cuePreviewPlayback).toBe("playing");
  });

  it("preserves an Arrangement session when a Published asset forks to a new revision", () => {
    const reference = useProjectStore.getState().selectedArrangementRef;
    projectActions.setArrangementPlayhead(reference, 5_760);
    projectActions.setArrangementLoop(reference, {
      loopEnabled: true,
      loopStartTick: 960,
      loopEndTick: 7_680,
    });
    projectActions.markPublished();

    projectActions.renameArrangement(reference, "House 128 Revised");
    const revised = useProjectStore.getState().selectedArrangementRef;

    expect(revised).toEqual({ id: reference.id, revision: reference.revision + 1 });
    expect(useProjectStore.getState().arrangementSessions[assetKey(revised)]).toMatchObject({
      playheadTick: 5_760,
      loopEnabled: true,
      loopStartTick: 960,
      loopEndTick: 7_680,
    });
  });

  it("persists multiple Arrangements and their independent authoring sessions for reopen", async () => {
    const house = useProjectStore.getState().selectedArrangementRef;
    const journey = projectActions.duplicateArrangement(house, "Tempo Journey")!;
    const journeyId = useProjectStore.getState().selectedArrangementRef.id;
    projectActions.updateArrangement(journey, "Add multi-tempo map", (arrangement) => {
      arrangement.tempo_map.points.push({ time_tick: 7_680, bpm: 96 });
    });
    const revisedJourney = useProjectStore.getState().selectedArrangementRef;
    projectActions.setArrangementPlayhead(revisedJourney, 8_640);
    const persisted = localStorage.getItem("lumina-project-v1");
    expect(persisted).not.toBeNull();

    projectActions.reset();
    localStorage.setItem("lumina-project-v1", persisted!);
    await useProjectStore.persist.rehydrate();

    const reopened = useProjectStore.getState();
    expect(reopened.bundle.manifest.arrangement_refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: house.id }),
        expect.objectContaining({ id: journeyId }),
      ]),
    );
    expect(
      exactAsset(reopened.bundle.arrangements, reopened.selectedArrangementRef)?.tempo_map.points,
    ).toHaveLength(2);
    expect(reopened.arrangementSessions[assetKey(revisedJourney)]?.playheadTick).toBe(8_640);
  });
});
