import type { ProjectBundle } from "@/bridge/types";

export const DEFAULT_STAGE_ROWS = 8;
export const DEFAULT_STAGE_COLUMNS = 10;
export const DEFAULT_STAGE_FIXTURE_COUNT = DEFAULT_STAGE_ROWS * DEFAULT_STAGE_COLUMNS;
export const DEFAULT_LAYOUT_GAP = 10;

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
        patch: [{ profile_id: "generic-rgb", id_range: [1, DEFAULT_STAGE_FIXTURE_COUNT] }],
        layout_ref: { id: "matrix-4x4", revision: 1 },
        groups: [
          {
            id: "all-fixtures",
            name: "All fixtures",
            fixtures: { range: [1, DEFAULT_STAGE_FIXTURE_COUNT] },
            sort_by: "none",
          },
        ],
        target_sets: [
          { id: "all", name: "All", selector: { type: "all" } },
          {
            id: "rows",
            name: "Rows",
            selector: {
              type: "rows",
              indices: Array.from({ length: DEFAULT_STAGE_ROWS }, (_, index) => index),
            },
          },
          {
            id: "columns",
            name: "Columns",
            selector: {
              type: "columns",
              indices: Array.from({ length: DEFAULT_STAGE_COLUMNS }, (_, index) => index),
            },
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
  const gap = { x: DEFAULT_LAYOUT_GAP, y: DEFAULT_LAYOUT_GAP };
  const pitch = {
    x: fixtureSize.width + gap.x,
    y: fixtureSize.height + gap.y,
  };
  const origin = { x: 0, y: 0 };
  return [
    {
      schema_version: 1,
      id: "matrix-4x4",
      revision: 1,
      name: "Matrix 8×10",
      category: "basic",
      editor: { mode: "form" },
      geometry: {
        shape: "matrix",
        rows: DEFAULT_STAGE_ROWS,
        columns: DEFAULT_STAGE_COLUMNS,
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
      name: "Circle 3 Rings",
      category: "basic",
      editor: { mode: "form" },
      geometry: {
        shape: "circle",
        rings: 3,
        increment: 6,
        fixture_size: fixtureSize,
        ring_gap: DEFAULT_LAYOUT_GAP,
        ring_pitch: Math.max(fixtureSize.width, fixtureSize.height) + DEFAULT_LAYOUT_GAP,
        center: origin,
      },
    },
    {
      schema_version: 1,
      id: "strip-16",
      revision: 1,
      name: "Strip 80",
      category: "basic",
      editor: { mode: "form" },
      geometry: {
        shape: "strip",
        count: DEFAULT_STAGE_FIXTURE_COUNT,
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
      name: "Wall 8×10",
      category: "basic",
      editor: { mode: "form" },
      geometry: {
        shape: "wall",
        rows: DEFAULT_STAGE_ROWS,
        columns: DEFAULT_STAGE_COLUMNS,
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
      name: "Frame 12×30",
      category: "basic",
      editor: { mode: "form" },
      geometry: {
        shape: "frame",
        rows: 12,
        columns: 30,
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
      name: "Lissajous 80",
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
        count: DEFAULT_STAGE_FIXTURE_COUNT,
        fixture_size: fixtureSize,
        origin,
        parameters: { a: 3, b: 2, delta: Math.PI / 2, scale_x: 160, scale_y: 120 },
      },
    },
    {
      schema_version: 1,
      id: "custom-16",
      revision: 1,
      name: "Custom 80",
      category: "generated_advanced",
      editor: { mode: "advanced_only" },
      geometry: {
        shape: "custom",
        fixture_size: fixtureSize,
        fixtures: Array.from({ length: DEFAULT_STAGE_FIXTURE_COUNT }, (_, index) => ({
          id: index + 1,
          x: (index % DEFAULT_STAGE_COLUMNS) * pitch.x,
          y: Math.floor(index / DEFAULT_STAGE_COLUMNS) * pitch.y,
        })),
      },
    },
  ];
}
