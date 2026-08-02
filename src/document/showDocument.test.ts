import { describe, expect, it } from "vitest";
import { validateShowDocument } from "./showDocument";

const document = {
  schema_version: 1,
  meta: { name: "Contract" },
  patch: [],
  layout: { type: "generator", generator: { shape: "custom", fixtures: [] } },
  groups: [],
  phasers: [],
};

describe("generated ShowDocumentV1 validator", () => {
  it("accepts the current version and rejects unknown fields", () => {
    expect(validateShowDocument(document).success).toBe(true);

    const invalid = structuredClone(document) as typeof document & { unknown?: boolean };
    invalid.unknown = true;
    const result = validateShowDocument(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.keyword === "additionalProperties")).toBe(true);
    }
  });

  it("fails closed for an unknown schema version", () => {
    const result = validateShowDocument({ ...document, schema_version: 2 });

    expect(result.success).toBe(false);
  });

  it("accepts structured automation targets and rejects legacy target paths", () => {
    const action = {
      type: "animate",
      target: { scope: "global", parameter_id: "master_dimmer" },
      from: 0,
      to: 1,
    };
    const withTimeline = {
      ...document,
      timeline: { events: [{ beat: 0, duration: 1, action }] },
    };

    expect(validateShowDocument(withTimeline).success).toBe(true);
    expect(
      validateShowDocument({
        ...withTimeline,
        timeline: {
          events: [
            {
              beat: 0,
              duration: 1,
              action: { ...action, target: "global.master_dimmer" },
            },
          ],
        },
      }).success,
    ).toBe(false);
  });
});
