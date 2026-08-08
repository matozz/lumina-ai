import { describe, expect, it } from "vitest";
import { validateShowDocument } from "./showDocument";

const document = {
  schema_version: 1,
  meta: { name: "Contract" },
  patch: [],
  layout: { type: "generator", generator: { shape: "custom", fixtures: [] } },
  groups: [],
  effect_definitions: [],
  effect_instances: [],
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
    const result = validateShowDocument({ ...document, schema_version: 5 });

    expect(result.success).toBe(false);
  });

  it("accepts structured automation targets and rejects legacy target paths", () => {
    const lane = {
      id: "master-dimmer",
      target: { scope: "global", parameter_id: "master_dimmer" },
      keyframes: [
        {
          id: "master-start",
          time_tick: 0,
          value: { type: "scalar", value: 0 },
          interpolation: "linear",
        },
        {
          id: "master-end",
          time_tick: 960,
          value: { type: "scalar", value: 1 },
          interpolation: "hold",
        },
      ],
    };
    const withTimeline = {
      ...document,
      timeline: {
        ppq: 960,
        tempo_map: { points: [{ time_tick: 0, bpm: 120 }] },
        tracks: [
          {
            id: "automation",
            name: "Automation",
            overlap_policy: "layer",
            automation_lanes: [lane],
          },
        ],
      },
    };

    expect(validateShowDocument(withTimeline).success).toBe(true);
    expect(
      validateShowDocument({
        ...withTimeline,
        timeline: {
          ...withTimeline.timeline,
          tracks: [
            {
              ...withTimeline.timeline.tracks[0],
              automation_lanes: [{ ...lane, target: "global.master_dimmer" }],
            },
          ],
        },
      }).success,
    ).toBe(false);
  });
});
