import type { ProjectBundle } from "@/bridge/types";
import {
  builtinArrangements,
  builtinLayouts,
  builtinProjectTemplate,
} from "@/catalog/builtinCatalog";

export const DEFAULT_STAGE_ROWS = 20;
export const DEFAULT_STAGE_COLUMNS = 20;
export const DEFAULT_STAGE_FIXTURE_COUNT = DEFAULT_STAGE_ROWS * DEFAULT_STAGE_COLUMNS;
export const DEFAULT_LAYOUT_GAP = 8;

export function createStarterProjectBundle(): ProjectBundle {
  const template = structuredClone(builtinProjectTemplate());
  const layouts = structuredClone(builtinLayouts);
  const arrangements = structuredClone(builtinArrangements);
  const arrangement = arrangements.find(
    (candidate) =>
      candidate.id === template.arrangement_ref.id &&
      candidate.revision === template.arrangement_ref.revision,
  );
  if (!arrangement) {
    throw new Error("Authoring Starter references a missing built-in Arrangement");
  }
  if (
    !layouts.some(
      (layout) =>
        layout.id === template.stage.layout_ref.id &&
        layout.revision === template.stage.layout_ref.revision,
    )
  ) {
    throw new Error("Authoring Starter references a missing built-in Layout");
  }

  return {
    schema_version: 1,
    manifest: {
      schema_version: 1,
      project_id: "lumina-project",
      revision: 1,
      name: "Untitled Lighting Project",
      stage_ref: { id: template.stage.id, revision: template.stage.revision },
      layout_refs: structuredClone(template.layout_refs),
      effect_refs: [],
      cue_refs: [],
      arrangement_refs: arrangements.map(({ id, revision }) => ({ id, revision })),
      active_arrangement_id: arrangement.id,
    },
    stages: [template.stage],
    layouts,
    effects: [],
    cues: [],
    arrangements,
  };
}
