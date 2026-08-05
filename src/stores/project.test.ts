import { beforeEach, describe, expect, it } from "vitest";
import type { ProjectPreviewFrame } from "@/bridge/types";
import {
  authoringSessionKey,
  authoringTransportActions,
  useAuthoringTransportStore,
} from "@/authoring/transport";
import { activeStage, assetKey, exactAsset } from "@/document/projectModel";
import {
  PREVIEW_DARK_FRAME_NOTICE_THRESHOLD,
  projectActions,
  simplifyLegacyCueNames,
  useProjectStore,
} from "./project";

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

  it("tracks sustained dark preview frames and resets after visible output", () => {
    const frame = previewFrame(0);
    for (let index = 1; index < PREVIEW_DARK_FRAME_NOTICE_THRESHOLD; index += 1) {
      projectActions.setPreviewResult(frame);
    }
    expect(useProjectStore.getState().previewSummary?.consecutiveDarkFrames).toBe(
      PREVIEW_DARK_FRAME_NOTICE_THRESHOLD - 1,
    );

    projectActions.setPreviewResult(frame);
    expect(useProjectStore.getState().previewSummary?.consecutiveDarkFrames).toBe(
      PREVIEW_DARK_FRAME_NOTICE_THRESHOLD,
    );

    projectActions.setPreviewResult(previewFrame(0.8));
    expect(useProjectStore.getState().previewSummary).toMatchObject({
      litFixtureCount: 1,
      consecutiveDarkFrames: 0,
    });
  });

  it("pauses the current preview before selecting another Effect", () => {
    const first = projectActions.createEffect("First")!;
    const second = projectActions.createEffect("Second")!;
    const key = authoringSessionKey("effect", assetKey(first));
    projectActions.setSelectedEffectRef(first);
    authoringTransportActions.ensureSession({ key, scope: "effect", durationTicks: 3_840 });
    authoringTransportActions.play(key);

    projectActions.setSelectedEffectRef(second);

    expect(useAuthoringTransportStore.getState().sessions[key].playback).toBe("paused");
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

  it("saves a Stage-pinned Layout as a new exact revision without changing the Stage", () => {
    const state = useProjectStore.getState();
    const stageRef = structuredClone(state.bundle.manifest.stage_ref);
    const layoutRef = structuredClone(state.selectedLayoutRef);
    const layout = structuredClone(exactAsset(state.bundle.layouts, layoutRef)!);
    layout.name = "Matrix Zero Gap";
    if (layout.geometry.shape !== "matrix") throw new Error("starter matrix missing");
    layout.geometry.gap = { x: 0, y: 0 };
    layout.geometry.pitch = {
      x: layout.geometry.fixture_size.width,
      y: layout.geometry.fixture_size.height,
    };

    const saved = projectActions.saveLayoutDraft(layoutRef, layout);
    const next = useProjectStore.getState();

    expect(saved).toEqual({ id: layoutRef.id, revision: layoutRef.revision + 1 });
    expect(exactAsset(next.bundle.stages, stageRef)?.layout_ref).toEqual(layoutRef);
    expect(exactAsset(next.bundle.layouts, layoutRef)?.name).not.toBe("Matrix Zero Gap");
    expect(exactAsset(next.bundle.layouts, saved)?.name).toBe("Matrix Zero Gap");

    projectActions.undo();
    expect(exactAsset(useProjectStore.getState().bundle.layouts, saved)).toBeUndefined();
    projectActions.redo();
    expect(exactAsset(useProjectStore.getState().bundle.layouts, saved)?.name).toBe(
      "Matrix Zero Gap",
    );
  });

  it("resizes a contiguous Stage patch only after the active Layout has enough positions", () => {
    const state = useProjectStore.getState();
    const layoutRef = state.selectedLayoutRef;
    const layout = structuredClone(exactAsset(state.bundle.layouts, layoutRef)!);
    if (layout.geometry.shape !== "matrix") throw new Error("starter matrix missing");
    layout.geometry.rows = 5;
    layout.geometry.pitch.y = layout.geometry.fixture_size.height + layout.geometry.gap.y;
    const largerLayoutRef = projectActions.saveLayoutDraft(layoutRef, layout);
    const targetMappings = Object.fromEntries(
      activeStage(state.bundle)
        .target_sets.filter((target) => target.id !== "all")
        .map((target) => [target.id, "all"]),
    );
    projectActions.setSelectedTargetSetId("columns");
    projectActions.useLayoutOnStage({
      layoutRef: largerLayoutRef,
      mode: "remap",
      targetMappings,
      upgradeDependents: true,
    });
    expect(useProjectStore.getState().selectedTargetSetId).toBe("all");
    projectActions.markPublished();

    projectActions.setSelectedTargetSetId("rows");
    projectActions.resizeActiveStagePatch(20);
    const next = useProjectStore.getState();
    expect(next.selectedTargetSetId).toBe("all");
    expect(activeStage(next.bundle).patch).toEqual([
      { profile_id: "generic-rgb", id_range: [1, 20] },
    ]);
    expect(activeStage(next.bundle).groups[0].fixtures).toEqual({ range: [1, 20] });
    expect(activeStage(next.publishedBundle!).patch[0].id_range).toEqual([1, 16]);

    expect(() => projectActions.resizeActiveStagePatch(21)).toThrow(/provides 20 positions/);
  });

  it("upgrades compatible Stage, Cue, and Arrangement revisions as one explicit transaction", () => {
    const effect = projectActions.createEffect("Pulse")!;
    const cue = projectActions.createCue([effect], "Pulse Cue")!;
    const arrangement = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(arrangement, "Place Cue", (document) => {
      document.tracks[0].clips = [
        { id: "clip", cue_ref: cue, start_tick: 0, duration_tick: 3_840 },
      ];
    });
    const source = useProjectStore.getState();
    const sourceStageRef = structuredClone(source.bundle.manifest.stage_ref);
    const sourceArrangementRef = structuredClone(source.selectedArrangementRef);
    const wall = source.bundle.manifest.layout_refs.find(
      (reference) => reference.id === "wall-4x4",
    )!;
    projectActions.markPublished();

    const result = projectActions.useLayoutOnStage({
      layoutRef: wall,
      mode: "upgrade",
      upgradeDependents: true,
    });
    const next = useProjectStore.getState();
    const upgradedCue = result.cueUpgrades.get(assetKey(cue))!;
    const upgradedArrangement = result.arrangementUpgrades.get(assetKey(sourceArrangementRef))!;

    expect(result.stageRef).toEqual({ id: sourceStageRef.id, revision: 2 });
    expect(exactAsset(next.bundle.stages, sourceStageRef)?.layout_ref).not.toEqual(wall);
    expect(exactAsset(next.bundle.stages, result.stageRef)?.layout_ref).toEqual(wall);
    expect(exactAsset(next.bundle.cues, cue)?.compatible_stage_ref).toEqual(sourceStageRef);
    expect(exactAsset(next.bundle.cues, upgradedCue)?.compatible_stage_ref).toEqual(
      result.stageRef,
    );
    expect(
      exactAsset(next.bundle.arrangements, upgradedArrangement)?.tracks[0].clips?.[0].cue_ref,
    ).toEqual(upgradedCue);
    expect(next.publishedBundle?.manifest.stage_ref).toEqual(sourceStageRef);

    projectActions.undo();
    expect(useProjectStore.getState().bundle.manifest.stage_ref).toEqual(sourceStageRef);
    projectActions.redo();
    expect(useProjectStore.getState().bundle.manifest.stage_ref).toEqual(result.stageRef);
  });

  it("remaps incompatible grid TargetSets without mutating their historical Stage revision", () => {
    const state = useProjectStore.getState();
    const sourceStageRef = structuredClone(state.bundle.manifest.stage_ref);
    const circle = state.bundle.manifest.layout_refs.find(
      (reference) => reference.id === "circle-16",
    )!;
    const targetMappings = Object.fromEntries(
      state.bundle.stages[0].target_sets
        .filter((target) => target.id !== "all")
        .map((target) => [target.id, "all"]),
    );

    const result = projectActions.useLayoutOnStage({
      layoutRef: circle,
      mode: "remap",
      targetMappings,
      upgradeDependents: true,
    });
    const next = useProjectStore.getState();
    const oldStage = exactAsset(next.bundle.stages, sourceStageRef)!;
    const upgradedStage = exactAsset(next.bundle.stages, result.stageRef)!;

    expect(oldStage.target_sets).toHaveLength(7);
    expect(oldStage.targeting_scenes?.[0].steps[1].selection).toEqual({
      target_set_id: "zones-3x3",
      partition_index: 0,
    });
    expect(upgradedStage.target_sets.map((target) => target.id)).toEqual(["all"]);
    expect(upgradedStage.targeting_scenes?.[0].steps[1].selection).toEqual({
      target_set_id: "all",
      partition_index: null,
    });
  });

  it("creates a separate Stage and empty Arrangement while preserving pinned dependents", () => {
    const effect = projectActions.createEffect("Pulse")!;
    const cue = projectActions.createCue([effect], "Pinned Cue")!;
    const arrangement = useProjectStore.getState().selectedArrangementRef;
    projectActions.updateArrangement(arrangement, "Place pinned Cue", (document) => {
      document.tracks[0].clips = [
        { id: "clip", cue_ref: cue, start_tick: 0, duration_tick: 3_840 },
      ];
    });
    const source = useProjectStore.getState();
    const sourceStageRef = structuredClone(source.bundle.manifest.stage_ref);
    const sourceArrangementRef = structuredClone(source.selectedArrangementRef);
    const circle = source.bundle.manifest.layout_refs.find(
      (reference) => reference.id === "circle-16",
    )!;
    const targetMappings = Object.fromEntries(
      activeStage(source.bundle)
        .target_sets.filter((target) => target.id !== "all")
        .map((target) => [target.id, "all"]),
    );

    const result = projectActions.useLayoutOnStage({
      layoutRef: circle,
      mode: "create_stage",
      targetMappings,
      upgradeDependents: false,
    });
    const next = useProjectStore.getState();
    const newArrangement = exactAsset(next.bundle.arrangements, next.selectedArrangementRef)!;

    expect(result.stageRef.id).not.toBe(sourceStageRef.id);
    expect(exactAsset(next.bundle.stages, sourceStageRef)).toBeDefined();
    expect(exactAsset(next.bundle.cues, cue)?.compatible_stage_ref).toEqual(sourceStageRef);
    expect(
      exactAsset(next.bundle.arrangements, sourceArrangementRef)?.tracks[0].clips,
    ).toHaveLength(1);
    expect(newArrangement.tracks.every((track) => (track.clips ?? []).length === 0)).toBe(true);
    expect(next.bundle.manifest.active_arrangement_id).toBe(newArrangement.id);
  });

  it("forks Stage and pinned draft references when a TargetSet revision is saved", () => {
    const effect = projectActions.createEffect("Pulse")!;
    const cue = projectActions.createCue([effect], "Rows Cue")!;
    projectActions.updateCueLayer(
      cue,
      exactAsset(useProjectStore.getState().bundle.cues, cue)!.layers[0].id,
      {
        target_set_ref: {
          stage_id: "main-stage",
          stage_revision: 1,
          target_set_id: "rows",
        },
      },
    );
    const state = useProjectStore.getState();
    const rows = structuredClone(
      activeStage(state.bundle).target_sets.find((target) => target.id === "rows")!,
    );
    rows.name = "Alternating rows";
    if (rows.selector.type !== "rows") throw new Error("rows selector missing");
    rows.selector.indices = [0, 2];

    projectActions.saveTargetSet("rows", rows);
    const next = useProjectStore.getState();
    const upgradedStage = activeStage(next.bundle);
    const upgradedCue = exactAsset(next.bundle.cues, next.selectedCueRef)!;

    expect(next.bundle.manifest.stage_ref).toEqual({ id: "main-stage", revision: 2 });
    expect(
      exactAsset(next.bundle.stages, { id: "main-stage", revision: 1 })?.target_sets.find(
        (target) => target.id === "rows",
      )?.name,
    ).toBe("Rows");
    expect(upgradedStage.target_sets.find((target) => target.id === "rows")?.name).toBe(
      "Alternating rows",
    );
    expect(upgradedCue.compatible_stage_ref).toEqual(next.bundle.manifest.stage_ref);
    expect(upgradedCue.layers[0].target_set_ref.stage_revision).toBe(2);
    expect(() => projectActions.deleteTargetSet("zones-3x3")).toThrow(/TargetingScene/);
  });

  it("forks TargetingScene and Cue references without changing fixture Group membership", () => {
    const effect = projectActions.createEffect("Pulse")!;
    const cue = projectActions.createCue([effect], "Scene Cue")!;
    const cueAsset = exactAsset(useProjectStore.getState().bundle.cues, cue)!;
    projectActions.updateCueLayer(cue, cueAsset.layers[0].id, {
      targeting_scene_ref: {
        stage_id: "main-stage",
        stage_revision: 1,
        targeting_scene_id: "all-zones-all",
      },
    });
    const before = useProjectStore.getState();
    const groupMembership = structuredClone(activeStage(before.bundle).groups);
    const scene = structuredClone(activeStage(before.bundle).targeting_scenes?.[0])!;
    scene.looped = true;

    projectActions.saveTargetingScene(scene.id, scene);
    const next = useProjectStore.getState();
    const upgradedStage = activeStage(next.bundle);
    const upgradedCue = exactAsset(next.bundle.cues, next.selectedCueRef)!;

    expect(upgradedStage.groups).toEqual(groupMembership);
    expect(upgradedStage.targeting_scenes?.[0].looped).toBe(true);
    expect(upgradedCue.layers[0].targeting_scene_ref).toMatchObject({
      stage_revision: upgradedStage.revision,
      targeting_scene_id: scene.id,
    });
    expect(() => projectActions.deleteTargetingScene(scene.id)).toThrow(/Cue revisions/);
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
    const stageBeforeSceneSave = activeStage(useProjectStore.getState().bundle);
    const scene = structuredClone(stageBeforeSceneSave.targeting_scenes?.[0]);
    if (!scene) throw new Error("starter TargetingScene missing");
    scene.looped = true;
    projectActions.saveTargetingScene(scene.id, scene);
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
    expect(activeStage(reopened.bundle).targeting_scenes?.[0].looped).toBe(true);
    expect(useAuthoringTransportStore.getState().sessions[sessionKey]).toBeUndefined();
    expect(persisted).not.toContain("cursorTick");
  });

  it("repairs the misleading name left by the removed Pulse plus Gradient stack", () => {
    const effect = projectActions.createEffect("Pulse")!;
    const cueRef = projectActions.createCue([effect], "Pulse + Gradient")!;
    const bundle = useProjectStore.getState().bundle;

    simplifyLegacyCueNames(bundle);

    expect(exactAsset(bundle.cues, cueRef)?.name).toBe("Pulse Cue");
  });
});

function previewFrame(intensity: number): ProjectPreviewFrame {
  return {
    generation: 1,
    source: { type: "authoring_draft" },
    context: { type: "stage" },
    project_ref: { id: "project", revision: 1 },
    stage_ref: { id: "stage", revision: 1 },
    arrangement_ref: { id: "arrangement", revision: 1 },
    playhead_tick: 0,
    layout_coords: [],
    outputs: [
      {
        id: 1,
        profile_id: "generic-rgb",
        attributes: [{ id: "intensity", value: { type: "scalar", value: intensity } }],
      },
    ],
  };
}
