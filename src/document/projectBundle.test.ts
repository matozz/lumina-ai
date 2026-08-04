import { describe, expect, it } from "vitest";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { validateProjectBundle } from "./projectBundle";

const project = createStarterProjectBundle();

describe("generated ProjectBundle v2 validator", () => {
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

  it("fails closed for independent unknown schema versions", () => {
    expect(
      validateProjectBundle({
        ...project,
        stages: [{ ...project.stages[0], schema_version: 1 }],
      }).success,
    ).toBe(false);
  });
});
