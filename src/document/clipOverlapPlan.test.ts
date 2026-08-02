import { describe, expect, it } from "vitest";
import type { FullDSL } from "@/bridge/types";
import { clipOverlapPlan } from "./clipOverlapPlan";

function documentFixture(): FullDSL {
  return {
    schema_version: 4,
    meta: { name: "Overlap preview" },
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
              id: "selected",
              instance_id: "pulse",
              start_tick: 100,
              duration_tick: 900,
              source_offset_tick: 20,
              playback: "once",
              layer: 1,
            },
            {
              id: "left",
              instance_id: "pulse",
              start_tick: 0,
              duration_tick: 300,
              source_offset_tick: 0,
              playback: "once",
              layer: 0,
            },
            {
              id: "right",
              instance_id: "pulse",
              start_tick: 700,
              duration_tick: 600,
              source_offset_tick: 0,
              playback: "once",
              layer: 2,
            },
            {
              id: "boundary",
              instance_id: "pulse",
              start_tick: 1_000,
              duration_tick: 100,
              source_offset_tick: 0,
              playback: "once",
              layer: 3,
            },
          ],
          automation_lanes: [],
        },
      ],
    },
  };
}

describe("clipOverlapPlan", () => {
  it("previews the largest stable non-overlapping trim and exact replacements", () => {
    expect(clipOverlapPlan(documentFixture(), "effects", "selected")).toMatchObject({
      overlappingClipIds: ["left", "right"],
      trim: { startTick: 300, durationTick: 400, sourceOffsetTick: 220 },
    });
  });

  it("reports no trim when overlaps cover the entire selected clip", () => {
    const document = documentFixture();
    document.timeline!.tracks[0].clips!.push({
      id: "cover",
      instance_id: "pulse",
      start_tick: 50,
      duration_tick: 1_000,
      source_offset_tick: 0,
      playback: "once",
      layer: 4,
    });

    expect(clipOverlapPlan(document, "effects", "selected")?.trim).toBeNull();
  });
});
