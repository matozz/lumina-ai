import type { ProjectBundle } from "@/bridge/types";

export function createStarterProjectBundle(): ProjectBundle {
  return {
    schema_version: 2,
    manifest: {
      schema_version: 2,
      project_id: "lumina-project",
      revision: 1,
      name: "Untitled Lighting Project",
      stage_ref: { id: "main-stage", revision: 1 },
      layout_refs: [
        { id: "matrix-4x4", revision: 1 },
        { id: "circle-16", revision: 1 },
        { id: "strip-16", revision: 1 },
        { id: "wall-4x4", revision: 1 },
        { id: "frame-5x5", revision: 1 },
        { id: "lissajous-16", revision: 1 },
        { id: "custom-16", revision: 1 },
      ],
      effect_refs: [],
      cue_refs: [],
      arrangement_refs: [{ id: "house-128", revision: 1 }],
      active_arrangement_id: "house-128",
    },
    stages: [
      {
        schema_version: 2,
        id: "main-stage",
        revision: 1,
        name: "Main Stage",
        patch: [{ profile_id: "generic-rgb", id_range: [1, 16] }],
        layout_ref: { id: "matrix-4x4", revision: 1 },
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
          {
            id: "center",
            name: "Center",
            selector: { type: "center_edges", region: "center", thickness: 1 },
          },
          {
            id: "edges",
            name: "Edges",
            selector: { type: "center_edges", region: "edges", thickness: 1 },
          },
        ],
        targeting_scenes: [
          {
            id: "all-zones-all",
            name: "All → 3×3 Zones → All",
            looped: false,
            phase_continuity: true,
            steps: [
              {
                id: "all-in",
                selection: { target_set_id: "all" },
                duration: { value: 1, unit: "bar" },
                transition: { type: "hard" },
              },
              ...Array.from({ length: 9 }, (_, partitionIndex) => ({
                id: `zone-${partitionIndex + 1}`,
                selection: {
                  target_set_id: "zones-3x3",
                  partition_index: partitionIndex,
                },
                duration: { value: 1 as const, unit: "bar" as const },
                transition: { type: "hard" as const },
              })),
              {
                id: "all-out",
                selection: { target_set_id: "all" },
                duration: { value: 1, unit: "bar" },
                transition: {
                  type: "weighted",
                  duration: { value: 1, unit: "beat" },
                },
              },
            ],
          },
        ],
      },
    ],
    layouts: starterLayouts(),
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

function starterLayouts(): ProjectBundle["layouts"] {
  const fixtureSize = { width: 12, height: 12 };
  const gap = { x: 52, y: 52 };
  const pitch = { x: 64, y: 64 };
  const origin = { x: 0, y: 0 };
  return [
    {
      schema_version: 1,
      id: "matrix-4x4",
      revision: 1,
      name: "Matrix 4×4",
      category: "basic",
      editor: { mode: "form" },
      geometry: {
        shape: "matrix",
        rows: 4,
        columns: 4,
        fixture_size: fixtureSize,
        gap,
        pitch,
        origin,
      },
    },
    {
      schema_version: 1,
      id: "circle-16",
      revision: 1,
      name: "Circle 16",
      category: "basic",
      editor: { mode: "form" },
      geometry: {
        shape: "circle",
        rings: 1,
        increment: 15,
        fixture_size: fixtureSize,
        ring_gap: 52,
        ring_pitch: 64,
        center: origin,
      },
    },
    {
      schema_version: 1,
      id: "strip-16",
      revision: 1,
      name: "Strip 16",
      category: "basic",
      editor: { mode: "form" },
      geometry: {
        shape: "strip",
        count: 16,
        orientation: "horizontal",
        fixture_size: fixtureSize,
        gap,
        pitch,
        origin,
      },
    },
    {
      schema_version: 1,
      id: "wall-4x4",
      revision: 1,
      name: "Wall 4×4",
      category: "basic",
      editor: { mode: "form" },
      geometry: {
        shape: "wall",
        rows: 4,
        columns: 4,
        fixture_size: fixtureSize,
        gap,
        pitch,
        origin,
      },
    },
    {
      schema_version: 1,
      id: "frame-5x5",
      revision: 1,
      name: "Frame 5×5",
      category: "basic",
      editor: { mode: "form" },
      geometry: {
        shape: "frame",
        rows: 5,
        columns: 5,
        fixture_size: fixtureSize,
        gap,
        pitch,
        origin,
      },
    },
    {
      schema_version: 1,
      id: "lissajous-16",
      revision: 1,
      name: "Lissajous 16",
      category: "generated_advanced",
      editor: {
        mode: "parameter_schema",
        parameters: [
          {
            id: "a",
            label: "Horizontal frequency",
            value_type: "number",
            minimum: 1,
            maximum: 9,
            step: 1,
          },
          {
            id: "b",
            label: "Vertical frequency",
            value_type: "number",
            minimum: 1,
            maximum: 9,
            step: 1,
          },
          {
            id: "scale_x",
            label: "Width",
            value_type: "number",
            minimum: 1,
            maximum: 1000,
            step: 1,
          },
          {
            id: "scale_y",
            label: "Height",
            value_type: "number",
            minimum: 1,
            maximum: 1000,
            step: 1,
          },
        ],
      },
      geometry: {
        shape: "algorithm",
        algorithm: "lissajous",
        count: 16,
        fixture_size: fixtureSize,
        origin,
        parameters: { a: 3, b: 2, delta: Math.PI / 2, scale_x: 160, scale_y: 120 },
      },
    },
    {
      schema_version: 1,
      id: "custom-16",
      revision: 1,
      name: "Custom 16",
      category: "generated_advanced",
      editor: { mode: "advanced_only" },
      geometry: {
        shape: "custom",
        fixture_size: fixtureSize,
        fixtures: Array.from({ length: 16 }, (_, index) => ({
          id: index + 1,
          x: (index % 4) * 64,
          y: Math.floor(index / 4) * 64,
        })),
      },
    },
  ];
}
