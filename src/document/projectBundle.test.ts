import { describe, expect, it } from "vitest";
import { validateProjectBundle } from "./projectBundle";

const project = {
  schema_version: 1,
  manifest: {
    schema_version: 1,
    project_id: "project-1",
    revision: 1,
    name: "Project",
    stage_ref: { id: "stage-1", revision: 1 },
    effect_refs: [],
    cue_refs: [],
    arrangement_refs: [{ id: "arrangement-1", revision: 1 }],
    active_arrangement_id: "arrangement-1",
  },
  stages: [
    {
      schema_version: 1,
      id: "stage-1",
      revision: 1,
      name: "Stage",
      patch: [],
      layout: { type: "generator", generator: { shape: "custom", fixtures: [] } },
      groups: [],
      target_sets: [{ id: "all", name: "All", selector: { type: "all" } }],
    },
  ],
  effects: [],
  cues: [],
  arrangements: [
    {
      schema_version: 1,
      id: "arrangement-1",
      revision: 1,
      name: "House 128",
      ppq: 960,
      tempo_map: { points: [{ time_tick: 0, bpm: 128 }] },
      time_signatures: [{ time_tick: 0, numerator: 4, denominator: 4 }],
      length_ticks: 30_720,
      tracks: [],
    },
  ],
};

describe("generated ProjectBundle v1 validator", () => {
  it("accepts independent assets and exact revision references", () => {
    expect(validateProjectBundle(project)).toEqual({ success: true, data: project, issues: [] });
  });

  it("rejects embedded Arrangement assets and unknown fields", () => {
    const invalid = structuredClone(project) as typeof project & {
      arrangements: Array<(typeof project.arrangements)[number] & { layout?: unknown }>;
    };
    invalid.arrangements[0].layout = project.stages[0].layout;
    const result = validateProjectBundle(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.keyword === "additionalProperties")).toBe(true);
    }
  });

  it("fails closed for independent unknown schema versions", () => {
    expect(
      validateProjectBundle({
        ...project,
        stages: [{ ...project.stages[0], schema_version: 2 }],
      }).success,
    ).toBe(false);
  });
});
