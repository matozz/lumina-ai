import type {
  LayoutDefinition,
  LayoutGeometry,
  ProjectBundle,
} from "@/generated/project-contract-v2";
import type {
  LayoutDSL as LegacyLayoutDSL,
  ProjectBundle as ProjectBundleV1,
} from "@/generated/project-contract-v1";
import { validateProjectBundle } from "./projectBundle";

export interface ProjectBundleMigration {
  bundle: ProjectBundle;
  fromVersion: number;
  changes: Array<{ code: string; path: string; message: string }>;
}

export function migrateProjectBundle(value: unknown): ProjectBundleMigration {
  const version = projectVersion(value);
  if (version === 2) {
    const validated = validateProjectBundle(value);
    if (!validated.success) {
      throw new Error(
        validated.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"),
      );
    }
    return { bundle: validated.data, fromVersion: 2, changes: [] };
  }
  if (version !== 1) throw new Error(`Unsupported Project bundle schema version: ${version}`);

  const legacy = structuredClone(value) as ProjectBundleV1;
  const layouts: LayoutDefinition[] = [];
  const stages: ProjectBundle["stages"] = legacy.stages.map((stage) => {
    const layoutId = `layout-${stage.id}`;
    const layout = migrateLayout(layoutId, stage.revision, `${stage.name} Layout`, stage.layout);
    layouts.push(layout);
    return {
      schema_version: 2,
      id: stage.id,
      revision: stage.revision,
      name: stage.name,
      patch: structuredClone(stage.patch),
      layout_ref: { id: layout.id, revision: layout.revision },
      groups: structuredClone(stage.groups),
      target_sets: structuredClone(stage.target_sets),
      targeting_scenes: [],
    };
  });
  const layoutRefs = layouts.map(({ id, revision }) => ({ id, revision }));
  const bundle: ProjectBundle = {
    schema_version: 2,
    manifest: {
      ...structuredClone(legacy.manifest),
      schema_version: 2,
      layout_refs: layoutRefs,
    },
    stages,
    layouts,
    effects: structuredClone(legacy.effects),
    cues: legacy.cues.map((cue) => ({
      ...structuredClone(cue),
      schema_version: 2,
    })),
    arrangements: structuredClone(legacy.arrangements),
  };
  const validated = validateProjectBundle(bundle);
  if (!validated.success) {
    throw new Error(validated.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }
  return {
    bundle: validated.data,
    fromVersion: 1,
    changes: [
      ...layouts.map((layout, index) => ({
        code: "MIGRATION_EXTRACT_LAYOUT_ASSET",
        path: `stages[${index}].layout_ref`,
        message: `Created ${layout.id}@${layout.revision}; fixture IDs, coordinates, Groups, and TargetSets were preserved.`,
      })),
      {
        code: "MIGRATION_PROJECT_LAYOUT_REFS",
        path: "manifest.layout_refs",
        message:
          "Added exact LayoutDefinition references without changing Cue or Arrangement identity.",
      },
    ],
  };
}

function projectVersion(value: unknown) {
  if (!value || typeof value !== "object" || !("schema_version" in value)) return null;
  return (value as { schema_version?: unknown }).schema_version;
}

function migrateLayout(
  id: string,
  revision: number,
  name: string,
  layout: LegacyLayoutDSL,
): LayoutDefinition {
  const geometry = migrateGeometry(layout);
  const basic = geometry.shape === "matrix" || geometry.shape === "circle";
  return {
    schema_version: 1,
    id,
    revision,
    name,
    category: basic ? "basic" : "generated_advanced",
    editor:
      geometry.shape === "matrix" || geometry.shape === "circle"
        ? { mode: "form" }
        : geometry.shape === "formula"
          ? { mode: "parameter_schema", parameters: [] }
          : geometry.shape === "custom"
            ? { mode: "advanced_only" }
            : {
                mode: "read_only",
                reason: "SVG source is preserved; visual path editing is not available in Setup.",
              },
    geometry,
  };
}

function migrateGeometry(layout: LegacyLayoutDSL): LayoutGeometry {
  const generator = layout.generator;
  if (generator.shape === "matrix") {
    const size = Math.max(0.000_001, Math.min(12, generator.spacing));
    const [x, y] = generator.origin ?? [0, 0];
    return {
      shape: "matrix",
      rows: generator.rows,
      columns: generator.columns,
      fixture_size: { width: size, height: size },
      gap: { x: Math.max(0, generator.spacing - size), y: Math.max(0, generator.spacing - size) },
      pitch: { x: generator.spacing, y: generator.spacing },
      origin: { x, y },
    };
  }
  if (generator.shape === "circle") {
    const size = Math.max(0.000_001, Math.min(12, generator.gap));
    const [x, y] = generator.center ?? [0, 0];
    return {
      shape: "circle",
      rings: generator.rings,
      increment: generator.increment,
      fixture_size: { width: size, height: size },
      ring_gap: Math.max(0, generator.gap - size),
      ring_pitch: generator.gap,
      center: { x, y },
    };
  }
  if (generator.shape === "formula") {
    return {
      shape: "formula",
      formula: structuredClone(generator.formula),
      fixture_size: { width: 12, height: 12 },
    };
  }
  if (generator.shape === "svg_path") {
    return {
      shape: "svg_path",
      svg_path: structuredClone(generator.svgPath),
      fixture_size: { width: 12, height: 12 },
    };
  }
  return {
    shape: "custom",
    fixtures: structuredClone(generator.fixtures),
    fixture_size: { width: 12, height: 12 },
  };
}
