import type { ProjectBundle } from "@/bridge/types";
import {
  builtinArrangements,
  builtinEffects,
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
  const cues = structuredClone(template.cues ?? []);
  const effectRefs = new Map(
    builtinEffects.map(
      (effect) =>
        [`${effect.id}@${effect.revision}`, { id: effect.id, revision: effect.revision }] as const,
    ),
  );
  const effects = structuredClone(builtinEffects);
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
  const cueRefs = new Set(cues.map((cue) => `${cue.id}@${cue.revision}`));
  if (
    arrangements.some((candidate) =>
      candidate.tracks.some((track) =>
        (track.clips ?? []).some(
          (clip) => !cueRefs.has(`${clip.cue_ref.id}@${clip.cue_ref.revision}`),
        ),
      ),
    )
  ) {
    throw new Error("Built-in Arrangement references a missing Authoring Starter Cue");
  }

  return {
    schema_version: 1,
    manifest: {
      schema_version: 1,
      project_id: "lumina-project",
      revision: 1,
      name: "Lighting Project",
      stage_ref: { id: template.stage.id, revision: template.stage.revision },
      layout_refs: structuredClone(template.layout_refs),
      effect_refs: [...effectRefs.values()].map((reference) => structuredClone(reference)),
      cue_refs: cues.map(({ id, revision }) => ({ id, revision })),
      arrangement_refs: arrangements.map(({ id, revision }) => ({ id, revision })),
      active_arrangement_id: arrangement.id,
    },
    stages: [template.stage],
    layouts,
    effects,
    cues,
    arrangements,
  };
}
