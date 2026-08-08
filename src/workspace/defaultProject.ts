import type { FullDSL } from "@/bridge/types";
import {
  DEFAULT_STAGE_COLUMNS,
  DEFAULT_STAGE_FIXTURE_COUNT,
  DEFAULT_STAGE_ROWS,
} from "./defaultProjectBundle";

export function createStarterProject(): FullDSL {
  return {
    schema_version: 1,
    meta: { name: "Untitled DJ Set" },
    patch: [{ profile_id: "generic-rgb", id_range: [1, DEFAULT_STAGE_FIXTURE_COUNT] }],
    layout: {
      type: "generator",
      generator: {
        shape: "matrix",
        rows: DEFAULT_STAGE_ROWS,
        columns: DEFAULT_STAGE_COLUMNS,
        spacing: 20,
        origin: [0, 0],
      },
    },
    groups: [
      {
        id: "all-fixtures",
        name: "All fixtures",
        fixtures: { range: [1, DEFAULT_STAGE_FIXTURE_COUNT] },
        sort_by: "none",
      },
    ],
    effect_definitions: [],
    effect_instances: [],
    timeline: {
      ppq: 960,
      tempo_map: { points: [{ time_tick: 0, bpm: 128 }] },
      tracks: [
        {
          id: "effects",
          name: "Lighting looks",
          overlap_policy: "layer",
          clips: [],
          automation_lanes: [],
        },
      ],
    },
  };
}
