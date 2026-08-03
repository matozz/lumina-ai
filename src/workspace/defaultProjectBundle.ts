import type { ProjectBundle } from "@/bridge/types";

export function createStarterProjectBundle(): ProjectBundle {
  return {
    schema_version: 1,
    manifest: {
      schema_version: 1,
      project_id: "lumina-project",
      revision: 1,
      name: "Untitled Lighting Project",
      stage_ref: { id: "main-stage", revision: 1 },
      effect_refs: [],
      cue_refs: [],
      arrangement_refs: [{ id: "house-128", revision: 1 }],
      active_arrangement_id: "house-128",
    },
    stages: [
      {
        schema_version: 1,
        id: "main-stage",
        revision: 1,
        name: "Main Stage",
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
        target_sets: [
          { id: "all", name: "All", selector: { type: "all" } },
          { id: "rows", name: "Rows", selector: { type: "rows", indices: [0, 1, 2, 3] } },
          {
            id: "columns",
            name: "Columns",
            selector: { type: "columns", indices: [0, 1, 2, 3] },
          },
          {
            id: "zones-3x3",
            name: "3×3 Zones",
            selector: {
              type: "grid_zones",
              rows: 3,
              columns: 3,
              zones: Array.from({ length: 9 }, (_, index) => ({
                row: Math.floor(index / 3),
                column: index % 3,
              })),
            },
          },
          {
            id: "checkerboard",
            name: "Checkerboard",
            selector: { type: "checkerboard", parity: "even" },
          },
        ],
      },
    ],
    effects: [],
    cues: [],
    arrangements: [
      {
        schema_version: 1,
        id: "house-128",
        revision: 1,
        name: "House 128",
        ppq: 960,
        tempo_map: { points: [{ time_tick: 0, bpm: 128 }] },
        time_signatures: [{ time_tick: 0, numerator: 4, denominator: 4 }],
        length_ticks: 30_720,
        tracks: [
          {
            id: "cues",
            name: "Cues",
            overlap_policy: "layer",
            clips: [],
            automation_lanes: [],
          },
        ],
        markers: [],
      },
    ],
  };
}
