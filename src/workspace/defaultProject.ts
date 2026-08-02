import type { FullDSL } from "@/bridge/types";

export function createStarterProject(): FullDSL {
  return {
    schema_version: 4,
    meta: { name: "Untitled DJ Set" },
    patch: [{ profile_id: "generic-rgb", id_range: [1, 16] }],
    layout: {
      type: "generator",
      generator: {
        shape: "matrix",
        rows: 4,
        columns: 4,
        spacing: 64,
        origin: [0, 0],
      },
    },
    groups: [
      {
        id: "all-fixtures",
        name: "All fixtures",
        fixtures: { range: [1, 16] },
        sort_by: "none",
      },
    ],
    effect_definitions: [],
    effect_instances: [],
    timeline: {
      ppq: 960,
      tempo_map: { points: [{ time_tick: 0, bpm: 120 }] },
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
