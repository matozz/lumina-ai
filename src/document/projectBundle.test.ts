import { describe, expect, it } from "vitest";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { validateProjectBundle } from "./projectBundle";

const project = createStarterProjectBundle();

describe("generated ProjectBundle V1 validator", () => {
  it("accepts independent assets and exact revision references", () => {
    expect(validateProjectBundle(project)).toEqual({ success: true, data: project, issues: [] });
  });

  it("rejects embedded Arrangement assets and unknown fields", () => {
    const invalid = structuredClone(project) as typeof project & {
      arrangements: Array<(typeof project.arrangements)[number] & { layout?: unknown }>;
    };
    invalid.arrangements[0].layout = project.layouts[0].geometry;
    const result = validateProjectBundle(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.keyword === "additionalProperties")).toBe(true);
    }
  });

  it("keeps fixture-area selection on Cue layers rather than Arrangement clips", () => {
    const invalid = structuredClone(project) as typeof project & {
      arrangements: Array<
        (typeof project.arrangements)[number] & {
          tracks: Array<
            (typeof project.arrangements)[number]["tracks"][number] & {
              clips: Array<
                NonNullable<
                  (typeof project.arrangements)[number]["tracks"][number]["clips"]
                >[number] & { target_set_id?: string }
              >;
            }
          >;
        }
      >;
    };
    invalid.arrangements[0].tracks[0].clips = [
      {
        id: "invalid-direct-target",
        cue_ref: { id: "cue", revision: 1 },
        start_tick: 0,
        duration_tick: 960,
        target_set_id: "zone-2x2-1",
      },
    ];

    const result = validateProjectBundle(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ keyword: "additionalProperties" }),
      );
    }
  });

  it("fails closed for independent unknown schema versions", () => {
    expect(
      validateProjectBundle({
        ...project,
        stages: [{ ...project.stages[0], schema_version: 2 as 1 }],
      }).success,
    ).toBe(false);
  });
});
