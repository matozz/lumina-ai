import { describe, expect, it } from "vitest";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { migrateProjectBundle } from "./projectMigration";

describe("Project bundle Layout migration", () => {
  it("extracts embedded Stage layouts without losing fixture IDs, Groups, or TargetSets", () => {
    const current = createStarterProjectBundle();
    const { layout_refs: _layoutRefs, ...legacyManifest } = current.manifest;
    const legacy = {
      ...structuredClone(current),
      schema_version: 1,
      manifest: { ...legacyManifest, schema_version: 1 },
      stages: current.stages.map(
        ({ layout_ref: _layoutRef, targeting_scenes: _scenes, ...stage }) => ({
          ...structuredClone(stage),
          schema_version: 1,
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
        }),
      ),
      layouts: undefined,
    };
    delete legacy.layouts;

    const migrated = migrateProjectBundle(legacy);
    const stage = migrated.bundle.stages[0];

    expect(migrated.fromVersion).toBe(1);
    expect(migrated.changes.map((change) => change.code)).toContain(
      "MIGRATION_EXTRACT_LAYOUT_ASSET",
    );
    expect(stage.patch).toEqual(current.stages[0].patch);
    expect(stage.groups).toEqual(current.stages[0].groups);
    expect(stage.target_sets).toEqual(current.stages[0].target_sets);
    expect(stage.layout_ref).toEqual({ id: "layout-main-stage", revision: 1 });
    expect(migrated.bundle.layouts[0].geometry).toMatchObject({
      shape: "matrix",
      rows: 4,
      columns: 4,
      gap: { x: 52, y: 52 },
      pitch: { x: 64, y: 64 },
    });
  });

  it("validates current bundles without creating migration changes", () => {
    const project = createStarterProjectBundle();
    expect(migrateProjectBundle(project)).toEqual({
      bundle: project,
      fromVersion: 2,
      changes: [],
    });
  });

  it("rejects unsupported versions without guessing a migration", () => {
    expect(() => migrateProjectBundle({ schema_version: 99 })).toThrow(
      "Unsupported Project bundle schema version: 99",
    );
  });
});
