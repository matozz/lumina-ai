import { beforeEach, describe, expect, it } from "vitest";
import type { FullDSL } from "@/bridge/types";
import { engineActions, useEngineStore } from "./engine";

const document: FullDSL = {
  schema_version: 4,
  meta: { name: "History" },
  patch: [],
  layout: { type: "generator", generator: { shape: "custom", fixtures: [] } },
  groups: [],
  effect_definitions: [],
  effect_instances: [],
  timeline: {
    ppq: 960,
    tempo_map: { points: [{ time_tick: 0, bpm: 120 }] },
    tracks: [
      {
        id: "effects",
        name: "Effects",
        overlap_policy: "layer",
        clips: [
          {
            id: "pulse",
            instance_id: "pulse",
            start_tick: 0,
            duration_tick: 960,
            source_offset_tick: 0,
            playback: "once",
            layer: 0,
          },
        ],
        automation_lanes: [],
      },
    ],
  },
};

describe("document history", () => {
  beforeEach(() => {
    useEngineStore.setState(useEngineStore.getInitialState(), true);
    engineActions.loadCurrentDslCode(JSON.stringify(document));
  });

  it("stores one history entry per transaction and restores undo/redo snapshots", () => {
    engineActions.applyDocumentTransaction({
      id: "drag-pulse",
      label: "Move and resize EffectClip",
      commands: [
        {
          type: "move_clip",
          track_id: "effects",
          clip_id: "pulse",
          start_tick: 480,
        },
        {
          type: "resize_clip",
          track_id: "effects",
          clip_id: "pulse",
          duration_tick: 1_920,
        },
      ],
    });

    expect(useEngineStore.getState()).toMatchObject({
      historyCursor: 1,
      isDocumentDirty: true,
    });
    expect(useEngineStore.getState().documentHistory).toHaveLength(1);
    expect(useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.[0]).toMatchObject({
      start_tick: 480,
      duration_tick: 1_920,
    });

    engineActions.undoDocument();
    expect(useEngineStore.getState().historyCursor).toBe(0);
    expect(useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.[0]).toMatchObject({
      start_tick: 0,
      duration_tick: 960,
    });

    engineActions.redoDocument();
    expect(useEngineStore.getState().historyCursor).toBe(1);
    expect(useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.[0]).toMatchObject({
      start_tick: 480,
      duration_tick: 1_920,
    });
  });

  it("tracks save points, dirty state, and invalidates redo after a branch", () => {
    engineActions.applyDocumentTransaction({
      id: "move-a",
      label: "Move EffectClip",
      commands: [
        {
          type: "move_clip",
          track_id: "effects",
          clip_id: "pulse",
          start_tick: 480,
        },
      ],
    });
    engineActions.markDocumentSaved();
    expect(useEngineStore.getState().isDocumentDirty).toBe(false);

    engineActions.undoDocument();
    expect(useEngineStore.getState().isDocumentDirty).toBe(true);
    engineActions.applyDocumentTransaction({
      id: "move-b",
      label: "Move EffectClip elsewhere",
      commands: [
        {
          type: "move_clip",
          track_id: "effects",
          clip_id: "pulse",
          start_tick: 960,
        },
      ],
    });

    expect(useEngineStore.getState()).toMatchObject({
      historyCursor: 1,
      savedHistoryCursor: null,
      isDocumentDirty: true,
    });
    engineActions.redoDocument();
    expect(useEngineStore.getState().parsedDsl?.timeline?.tracks[0].clips?.[0].start_tick).toBe(
      960,
    );
  });

  it("does not record a pointer transaction with no final document change", () => {
    engineActions.applyDocumentTransaction({
      id: "no-op-drag",
      label: "Move EffectClip",
      commands: [
        {
          type: "move_clip",
          track_id: "effects",
          clip_id: "pulse",
          start_tick: 0,
        },
      ],
    });

    expect(useEngineStore.getState()).toMatchObject({
      historyCursor: 0,
      isDocumentDirty: false,
    });
    expect(useEngineStore.getState().documentHistory).toHaveLength(0);
  });
});
