import { describe, expect, it } from "vitest";

import {
  builtinArrangements,
  builtinLayouts,
  builtinProjectTemplate,
  builtinProjectTemplates,
} from "./builtinCatalog";

describe("built-in declarative Catalog", () => {
  it("loads stable V1 identities from split source-controlled files", () => {
    expect(builtinLayouts.map((layout) => layout.id)).toContain("builtin.layout.matrix-main-20x20");
    expect(builtinArrangements.map((arrangement) => arrangement.id)).toContain(
      "builtin.arrangement.house-128",
    );
    expect(builtinProjectTemplates).toHaveLength(1);
    const identities = [
      ...builtinLayouts.map((asset) => `${asset.id}@${asset.revision}`),
      ...builtinArrangements.map((asset) => `${asset.id}@${asset.revision}`),
      ...builtinProjectTemplates.map((asset) => `${asset.id}@1`),
    ];
    expect(new Set(identities).size).toBe(identities.length);
  });

  it("keeps the starter Project template fully referential and at 128 BPM", () => {
    const template = builtinProjectTemplate();
    expect(template.stage.patch).toEqual([{ profile_id: "generic-rgb", id_range: [1, 400] }]);
    expect(template.stage.layout_ref).toEqual(template.layout_refs[0]);

    const arrangement = builtinArrangements.find(
      (candidate) => candidate.id === template.arrangement_ref.id,
    );
    expect(arrangement?.tempo_map.points[0]).toEqual({ time_tick: 0, bpm: 128 });
  });
});
