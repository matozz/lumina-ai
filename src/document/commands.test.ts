import { describe, expect, it } from "vitest";
import type { FullDSL } from "@/bridge/types";
import { createEffectPair, reviseEffectPair } from "@/workspace/effect-lab/effectFactory";
import { createStarterProject } from "@/workspace/defaultProject";
import {
  applyDocumentTransaction,
  DocumentCommandError,
  type DocumentTransaction,
} from "./commands";

function document(): FullDSL {
  return {
    schema_version: 1,
    meta: { name: "Commands" },
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
              id: "clip-a",
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
}

function transaction(commands: DocumentTransaction["commands"]): DocumentTransaction {
  return { id: "test-transaction", label: "Test transaction", commands };
}

describe("DocumentCommand transactions", () => {
  it("creates, revises, and deletes one reusable effect atomically", () => {
    const source = createStarterProject();
    const pair = createEffectPair(source);
    const created = applyDocumentTransaction(
      source,
      transaction([{ type: "create_effect", ...pair }]),
    );
    const revisedPair = reviseEffectPair(pair.definition, pair.instance, {
      name: "Red Pulse Renamed",
      targetGroupId: "all-fixtures",
      attributeMode: "intensity_color",
      waveform: "triangle",
      speed: 2,
      phase: 0.5,
      color: "#ff0000",
    });
    const revised = applyDocumentTransaction(
      created,
      transaction([
        {
          type: "revise_effect",
          definition_id: pair.definition.id,
          definition: revisedPair.definition,
          primary_instance: revisedPair.instance,
        },
      ]),
    );
    const deleted = applyDocumentTransaction(
      revised,
      transaction([{ type: "delete_effect", definition_id: pair.definition.id }]),
    );

    expect(source.effect_definitions).toHaveLength(0);
    expect(created.effect_definitions[0].revision).toBe(1);
    expect(revised.effect_definitions[0]).toMatchObject({
      id: pair.definition.id,
      name: "Red Pulse Renamed",
      revision: 2,
    });
    expect(revised.effect_instances[0]).toMatchObject({
      definition_revision: 2,
      target_group_id: "all-fixtures",
    });
    expect(deleted.effect_definitions).toHaveLength(0);
    expect(deleted.effect_instances).toHaveLength(0);
  });

  it("protects effect revisions that are referenced by Arrange", () => {
    const source = createStarterProject();
    const pair = createEffectPair(source);
    const created = applyDocumentTransaction(
      source,
      transaction([{ type: "create_effect", ...pair }]),
    );
    created.timeline!.tracks[0].clips!.push({
      id: "red-pulse-clip",
      instance_id: pair.instance.id,
      start_tick: 0,
      duration_tick: 960,
    });

    expect(() =>
      applyDocumentTransaction(
        created,
        transaction([{ type: "delete_effect", definition_id: pair.definition.id }]),
      ),
    ).toThrow("Remove this effect from Arrange");
  });

  it("replaces patch, layout, and groups as one undoable stage setup command", () => {
    const source = document();
    const next = applyDocumentTransaction(
      source,
      transaction([
        {
          type: "replace_stage_setup",
          patch: [{ profile_id: "generic-rgb", id_range: [1, 16] }],
          layout: {
            type: "generator",
            generator: { shape: "matrix", rows: 4, columns: 4, spacing: 64 },
          },
          groups: [
            {
              id: "all-fixtures",
              name: "All fixtures",
              fixtures: { range: [1, 16] },
              sort_by: "x",
            },
          ],
        },
      ]),
    );

    expect(source.patch).toEqual([]);
    expect(next.patch[0]).toEqual({ profile_id: "generic-rgb", id_range: [1, 16] });
    expect(next.layout.generator).toMatchObject({ shape: "matrix", rows: 4, columns: 4 });
    expect(next.groups[0]).toMatchObject({ id: "all-fixtures", sort_by: "x" });
  });

  it("applies multiple edits atomically without mutating the source or adjacent overlaps", () => {
    const source = document();
    const next = applyDocumentTransaction(
      source,
      transaction([
        {
          type: "add_clip",
          track_id: "effects",
          clip: {
            id: "clip-b",
            instance_id: "pulse",
            start_tick: 480,
            duration_tick: 960,
            source_offset_tick: 0,
            playback: "once",
            layer: 1,
          },
        },
        {
          type: "move_clip",
          track_id: "effects",
          clip_id: "clip-b",
          start_tick: 240,
        },
        {
          type: "resize_clip",
          track_id: "effects",
          clip_id: "clip-b",
          duration_tick: 1_200,
        },
      ]),
    );

    expect(source.timeline?.tracks[0].clips).toHaveLength(1);
    expect(source.timeline?.tracks[0].clips?.[0]).toMatchObject({
      id: "clip-a",
      start_tick: 0,
      duration_tick: 960,
    });
    expect(next.timeline?.tracks[0].clips).toEqual([
      source.timeline?.tracks[0].clips?.[0],
      expect.objectContaining({ id: "clip-b", start_tick: 240, duration_tick: 1_200 }),
    ]);
  });

  it("supports duplicate, split, trim, and loop as explicit commands", () => {
    const next = applyDocumentTransaction(
      document(),
      transaction([
        {
          type: "duplicate_clip",
          track_id: "effects",
          clip_id: "clip-a",
          new_clip_id: "clip-copy",
          start_tick: 1_920,
          layer: 2,
        },
        {
          type: "split_clip",
          track_id: "effects",
          clip_id: "clip-copy",
          split_tick: 2_400,
          right_clip_id: "clip-copy-right",
        },
        {
          type: "trim_clip",
          track_id: "effects",
          clip_id: "clip-copy-right",
          start_tick: 2_500,
          duration_tick: 300,
          source_offset_tick: 580,
        },
        {
          type: "set_clip_playback",
          track_id: "effects",
          clip_id: "clip-copy-right",
          playback: "loop",
        },
      ]),
    );
    const clips = next.timeline?.tracks[0].clips ?? [];

    expect(clips.find((clip) => clip.id === "clip-copy")).toMatchObject({
      start_tick: 1_920,
      duration_tick: 480,
      layer: 2,
    });
    expect(clips.find((clip) => clip.id === "clip-copy-right")).toMatchObject({
      start_tick: 2_500,
      duration_tick: 300,
      source_offset_tick: 580,
      playback: "loop",
    });
  });

  it("moves and scales every keyframe in one AutomationLane command", () => {
    const source = document();
    source.timeline!.tracks[0].automation_lanes = [
      {
        id: "master",
        target: { scope: "global", parameter_id: "master_dimmer" },
        keyframes: [
          {
            id: "master-0",
            time_tick: 0,
            value: { type: "scalar", value: 0 },
            interpolation: "linear",
          },
          {
            id: "master-1",
            time_tick: 480,
            value: { type: "scalar", value: 0.5 },
            interpolation: "linear",
          },
          {
            id: "master-2",
            time_tick: 960,
            value: { type: "scalar", value: 1 },
            interpolation: "hold",
          },
        ],
      },
    ];
    const next = applyDocumentTransaction(
      source,
      transaction([
        {
          type: "move_automation_lane",
          track_id: "effects",
          lane_id: "master",
          delta_tick: 960,
        },
        {
          type: "scale_automation_lane",
          track_id: "effects",
          lane_id: "master",
          start_tick: 960,
          duration_tick: 1_920,
        },
      ]),
    );

    expect(
      next.timeline?.tracks[0].automation_lanes?.[0].keyframes.map((key) => key.time_tick),
    ).toEqual([960, 1_920, 2_880]);

    const edited = applyDocumentTransaction(
      next,
      transaction([
        {
          type: "add_keyframe",
          track_id: "effects",
          lane_id: "master",
          keyframe: {
            id: "master-inserted",
            time_tick: 1_440,
            value: { type: "scalar", value: 0.25 },
            interpolation: "linear",
          },
        },
        {
          type: "move_keyframes",
          track_id: "effects",
          lane_id: "master",
          keyframe_ids: ["master-inserted", "master-1"],
          delta_tick: 120,
        },
        {
          type: "update_keyframe",
          track_id: "effects",
          lane_id: "master",
          keyframe_id: "master-inserted",
          value: { type: "scalar", value: 0.75 },
          interpolation: "ease_in_out",
        },
        {
          type: "delete_keyframes",
          track_id: "effects",
          lane_id: "master",
          keyframe_ids: ["master-0"],
        },
      ]),
    );
    expect(
      edited.timeline?.tracks[0].automation_lanes?.[0].keyframes.map((key) => [
        key.id,
        key.time_tick,
      ]),
    ).toEqual([
      ["master-inserted", 1_560],
      ["master-1", 2_040],
      ["master-2", 2_880],
    ]);
    expect(edited.timeline?.tracks[0].automation_lanes?.[0].keyframes[0]).toMatchObject({
      value: { type: "scalar", value: 0.75 },
      interpolation: "ease_in_out",
    });
  });

  it("fails the whole transaction when any command is invalid", () => {
    const source = document();
    expect(() =>
      applyDocumentTransaction(
        source,
        transaction([
          { type: "resize_clip", track_id: "effects", clip_id: "clip-a", duration_tick: 480 },
          { type: "delete_clip", track_id: "effects", clip_id: "missing" },
        ]),
      ),
    ).toThrow(DocumentCommandError);
    expect(source.timeline?.tracks[0].clips?.[0].duration_tick).toBe(960);
  });

  it("rejects a keyframe update with the wrong typed value atomically", () => {
    const source = document();
    source.timeline!.tracks[0].automation_lanes = [
      {
        id: "master",
        target: { scope: "global", parameter_id: "master_dimmer" },
        keyframes: [
          {
            id: "master-0",
            time_tick: 0,
            value: { type: "scalar", value: 1 },
            interpolation: "hold",
          },
        ],
      },
    ];

    expect(() =>
      applyDocumentTransaction(
        source,
        transaction([
          {
            type: "update_keyframe",
            track_id: "effects",
            lane_id: "master",
            keyframe_id: "master-0",
            value: { type: "color", value: "#ff0000" },
          },
        ]),
      ),
    ).toThrow("does not match scalar");
    expect(source.timeline!.tracks[0].automation_lanes?.[0].keyframes[0].value).toEqual({
      type: "scalar",
      value: 1,
    });
  });
});
