import { beforeEach, describe, expect, it } from "vitest";
import {
  authoringSessionKey,
  authoringTransportActions,
  useAuthoringTransportStore,
} from "@/authoring/transport";
import { assetKey, exactAsset } from "@/document/projectModel";
import { projectActions, useProjectStore } from "./project";

describe("Stage 7 Project state", () => {
  beforeEach(() => projectActions.reset());

  it("keeps per-Arrangement playhead and loop state while switching", () => {
    const house = useProjectStore.getState().selectedArrangementRef;
    const houseKey = authoringSessionKey("arrangement", assetKey(house));
    authoringTransportActions.ensureSession({
      key: houseKey,
      scope: "arrangement",
      durationTicks: 30_720,
    });
    authoringTransportActions.seek(houseKey, 1_920);
    authoringTransportActions.setLoop(houseKey, {
      enabled: true,
      startTick: 960,
      endTick: 3_840,
    });
    const journey = projectActions.duplicateArrangement(house, "Tempo Journey");
    expect(journey).not.toBeNull();
    const journeyKey = authoringSessionKey("arrangement", assetKey(journey!));
    authoringTransportActions.ensureSession({
      key: journeyKey,
      scope: "arrangement",
      durationTicks: 30_720,
    });
    authoringTransportActions.seek(journeyKey, 7_680);
    projectActions.selectArrangement(house);

    const sessions = useAuthoringTransportStore.getState().sessions;
    expect(sessions[houseKey]).toMatchObject({
      cursorTick: 1_920,
      loopEnabled: true,
    });
    expect(sessions[journeyKey]?.cursorTick).toBe(7_680);
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
    const effectKey = authoringSessionKey("effect", "pulse@1");
    const cueKey = authoringSessionKey("cue", "pulse-cue@1");
    authoringTransportActions.ensureSession({
      key: effectKey,
      scope: "effect",
      durationTicks: 3_840,
    });
    authoringTransportActions.ensureSession({ key: cueKey, scope: "cue", durationTicks: 3_840 });
    projectActions.setPreviewSource("rehearsal_published", 7);
    authoringTransportActions.play(effectKey);
    authoringTransportActions.play(cueKey);
    authoringTransportActions.pause(effectKey);
    projectActions.setPreviewSource("authoring_draft");

    const state = useProjectStore.getState();
    expect(state.previewSource).toBe("authoring_draft");
    expect(state.rehearsalPublishedRevision).toBeNull();
    expect(useAuthoringTransportStore.getState().sessions[effectKey].playback).toBe("paused");
    expect(useAuthoringTransportStore.getState().sessions[cueKey].playback).toBe("playing");
  });

  it("preserves an Arrangement session when a Published asset forks to a new revision", () => {
    const reference = useProjectStore.getState().selectedArrangementRef;
    const sourceKey = authoringSessionKey("arrangement", assetKey(reference));
    authoringTransportActions.ensureSession({
      key: sourceKey,
      scope: "arrangement",
      durationTicks: 30_720,
    });
    authoringTransportActions.seek(sourceKey, 5_760);
    authoringTransportActions.setLoop(sourceKey, {
      enabled: true,
      startTick: 960,
      endTick: 7_680,
    });
    projectActions.markPublished();

    projectActions.renameArrangement(reference, "House 128 Revised");
    const revised = useProjectStore.getState().selectedArrangementRef;
    const revisedKey = authoringSessionKey("arrangement", assetKey(revised));

    expect(revised).toEqual({ id: reference.id, revision: reference.revision + 1 });
    expect(useAuthoringTransportStore.getState().sessions[revisedKey]).toMatchObject({
      cursorTick: 5_760,
      loopEnabled: true,
      loopStartTick: 960,
      loopEndTick: 7_680,
    });
  });

  it("persists multiple Arrangements without serializing session-only authoring state", async () => {
    const house = useProjectStore.getState().selectedArrangementRef;
    const journey = projectActions.duplicateArrangement(house, "Tempo Journey")!;
    const journeyId = useProjectStore.getState().selectedArrangementRef.id;
    projectActions.updateArrangement(journey, "Add multi-tempo map", (arrangement) => {
      arrangement.tempo_map.points.push({ time_tick: 7_680, bpm: 96 });
    });
    const revisedJourney = useProjectStore.getState().selectedArrangementRef;
    const sessionKey = authoringSessionKey("arrangement", assetKey(revisedJourney));
    authoringTransportActions.ensureSession({
      key: sessionKey,
      scope: "arrangement",
      durationTicks: 30_720,
    });
    authoringTransportActions.seek(sessionKey, 8_640);
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
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]).toBeUndefined();
    expect(persisted).not.toContain("cursorTick");
  });
});
