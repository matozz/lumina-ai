import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import schema from "../../schemas/user-asset-pack-v1.schema.json";
import type { AssetRef, ProjectBundle, UserAssetPack } from "@/bridge/types";
import { validateProjectBundle } from "./projectBundle";
import { assetKey, exactAsset, uniqueId } from "./projectModel";

type PackAssetKind = "stage" | "layout" | "effect" | "cue" | "arrangement";

export interface AssetPackConflict {
  kind: PackAssetKind;
  id: string;
  incomingRevisions: number[];
  existingRevisions: number[];
}

export type AssetPackValidation =
  | { success: true; data: UserAssetPack; issues: [] }
  | { success: false; data: null; issues: Array<{ path: string; message: string }> };

const validator = new Ajv2020({ allErrors: true, strict: true });
for (const format of ["uint8", "uint32", "int32", "float", "double"]) {
  validator.addFormat(format, {
    type: "number",
    validate: (value: number) => Number.isFinite(value),
  });
}
const validateSchema = validator.compile<UserAssetPack>(schema);

export function validateUserAssetPack(value: unknown): AssetPackValidation {
  if (!validateSchema(value)) {
    return {
      success: false,
      data: null,
      issues: (validateSchema.errors ?? []).map(toIssue),
    };
  }
  const issues = validateAssetPackReferences(value);
  return issues.length === 0
    ? { success: true, data: value, issues: [] }
    : { success: false, data: null, issues };
}

export function createUserAssetPack(
  bundle: ProjectBundle,
  name = `${bundle.manifest.name} Assets`,
): UserAssetPack {
  const selectedLayouts = bundle.layouts.filter((layout) => !isBuiltinId(layout.id));
  const selectedEffects = bundle.effects.filter((effect) => effect.source !== "built_in");
  const selectedCues = [...bundle.cues];
  const selectedArrangements = bundle.arrangements.filter(
    (arrangement) =>
      !isBuiltinId(arrangement.id) ||
      arrangement.tracks.some((track) => (track.clips ?? []).length > 0),
  );

  const cueRefs = new Map(
    selectedCues.map((cue) => [assetKey(cue), { id: cue.id, revision: cue.revision }]),
  );
  for (const arrangement of selectedArrangements) {
    for (const clip of arrangement.tracks.flatMap((track) => track.clips ?? [])) {
      cueRefs.set(assetKey(clip.cue_ref), clip.cue_ref);
    }
  }
  const cues = [...cueRefs.values()].flatMap((reference) => {
    const cue = exactAsset(bundle.cues, reference);
    return cue ? [cue] : [];
  });
  const effectRefs = new Map(
    selectedEffects.map((effect) => [
      assetKey(effect),
      { id: effect.id, revision: effect.revision },
    ]),
  );
  const stageRefs = new Map(
    bundle.stages.map((stage) => [assetKey(stage), { id: stage.id, revision: stage.revision }]),
  );
  for (const cue of cues) {
    stageRefs.set(assetKey(cue.compatible_stage_ref), cue.compatible_stage_ref);
    for (const layer of cue.layers) effectRefs.set(assetKey(layer.effect_ref), layer.effect_ref);
  }
  const stages = [...stageRefs.values()].flatMap((reference) => {
    const stage = exactAsset(bundle.stages, reference);
    return stage ? [stage] : [];
  });
  const layoutRefs = new Map(
    selectedLayouts.map((layout) => [
      assetKey(layout),
      { id: layout.id, revision: layout.revision },
    ]),
  );
  for (const stage of stages) layoutRefs.set(assetKey(stage.layout_ref), stage.layout_ref);

  const pack: UserAssetPack = {
    schema_version: 1,
    id: uniqueId(`asset-pack-${slug(name)}`, []),
    name,
    source_project_id: bundle.manifest.project_id,
    stages: cloneAssets(stages),
    layouts: cloneAssets(
      [...layoutRefs.values()].flatMap((reference) => {
        const layout = exactAsset(bundle.layouts, reference);
        return layout ? [layout] : [];
      }),
    ),
    effects: cloneAssets(
      [...effectRefs.values()].flatMap((reference) => {
        const effect = exactAsset(bundle.effects, reference);
        return effect ? [effect] : [];
      }),
    ),
    cues: cloneAssets(cues),
    arrangements: cloneAssets(selectedArrangements),
  };
  const validation = validateUserAssetPack(pack);
  if (!validation.success) {
    throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }
  return pack;
}

export function assetPackConflicts(bundle: ProjectBundle, pack: UserAssetPack) {
  return (
    [
      ["stage", bundle.stages, pack.stages],
      ["layout", bundle.layouts, pack.layouts],
      ["effect", bundle.effects, pack.effects],
      ["cue", bundle.cues, pack.cues],
      ["arrangement", bundle.arrangements, pack.arrangements],
    ] as const
  ).flatMap(([kind, existing, incoming]) =>
    conflictsForKind(
      kind,
      existing as Array<{ id: string; revision: number }>,
      incoming as Array<{ id: string; revision: number }>,
    ),
  );
}

export function importUserAssetPack(
  bundle: ProjectBundle,
  value: unknown,
  onConflict: "reject" | "rename" = "reject",
) {
  const validation = validateUserAssetPack(value);
  if (!validation.success) {
    throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }
  const pack = structuredClone(validation.data);
  const conflicts = assetPackConflicts(bundle, pack);
  if (conflicts.length > 0 && onConflict === "reject") {
    throw new Error(
      `Asset pack conflicts: ${conflicts.map((conflict) => `${conflict.kind} ${conflict.id}`).join(", ")}`,
    );
  }
  if (conflicts.length > 0) renameConflictingAssets(bundle, pack, conflicts);

  const next = structuredClone(bundle);
  appendDistinct(next.stages, pack.stages);
  appendDistinct(next.layouts, pack.layouts);
  appendDistinct(next.effects, pack.effects);
  appendDistinct(next.cues, pack.cues);
  appendDistinct(next.arrangements, pack.arrangements);
  appendRefs(next.manifest.layout_refs, pack.layouts);
  appendRefs(next.manifest.effect_refs, pack.effects);
  appendRefs(next.manifest.cue_refs, pack.cues);
  appendRefs(next.manifest.arrangement_refs, pack.arrangements);
  next.manifest.revision += 1;
  const projectValidation = validateProjectBundle(next);
  if (!projectValidation.success) {
    throw new Error(
      projectValidation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"),
    );
  }
  return { bundle: next, conflicts, importedPack: pack };
}

function validateAssetPackReferences(pack: UserAssetPack) {
  const issues: Array<{ path: string; message: string }> = [];
  const layouts = new Set(pack.layouts.map(assetKey));
  const effects = new Set(pack.effects.map(assetKey));
  const cues = new Set(pack.cues.map(assetKey));
  for (const [index, stage] of pack.stages.entries()) {
    if (!layouts.has(assetKey(stage.layout_ref))) {
      issues.push({ path: `stages[${index}].layout_ref`, message: "Layout dependency is missing" });
    }
  }
  for (const [cueIndex, cue] of pack.cues.entries()) {
    const stage = pack.stages.find(
      (candidate) => assetKey(candidate) === assetKey(cue.compatible_stage_ref),
    );
    if (!stage) {
      issues.push({
        path: `cues[${cueIndex}].compatible_stage_ref`,
        message: "Stage dependency is missing",
      });
    }
    for (const [layerIndex, layer] of cue.layers.entries()) {
      if (!effects.has(assetKey(layer.effect_ref))) {
        issues.push({
          path: `cues[${cueIndex}].layers[${layerIndex}].effect_ref`,
          message: "Effect dependency is missing",
        });
      }
      if (
        !stage ||
        layer.target_set_ref.stage_id !== stage.id ||
        layer.target_set_ref.stage_revision !== stage.revision ||
        !stage.target_sets.some((targetSet) => targetSet.id === layer.target_set_ref.target_set_id)
      ) {
        issues.push({
          path: `cues[${cueIndex}].layers[${layerIndex}].target_set_ref`,
          message: "TargetSet dependency is missing or belongs to another Stage",
        });
      }
      if (
        layer.targeting_scene_ref &&
        (!stage ||
          layer.targeting_scene_ref.stage_id !== stage.id ||
          layer.targeting_scene_ref.stage_revision !== stage.revision ||
          !stage.targeting_scenes?.some(
            (scene) => scene.id === layer.targeting_scene_ref?.targeting_scene_id,
          ))
      ) {
        issues.push({
          path: `cues[${cueIndex}].layers[${layerIndex}].targeting_scene_ref`,
          message: "Targeting Scene dependency is missing or belongs to another Stage",
        });
      }
    }
  }
  for (const [arrangementIndex, arrangement] of pack.arrangements.entries()) {
    for (const [clipIndex, clip] of arrangement.tracks
      .flatMap((track) => track.clips ?? [])
      .entries()) {
      if (!cues.has(assetKey(clip.cue_ref))) {
        issues.push({
          path: `arrangements[${arrangementIndex}].clips[${clipIndex}].cue_ref`,
          message: "Cue dependency is missing",
        });
      }
    }
  }
  return issues;
}

function conflictsForKind<T extends { id: string; revision: number }>(
  kind: PackAssetKind,
  existing: T[],
  incoming: T[],
): AssetPackConflict[] {
  const incomingIds = new Set(incoming.map((asset) => asset.id));
  return [...incomingIds].flatMap((id) => {
    const existingAssets = existing.filter((asset) => asset.id === id);
    const incomingAssets = incoming.filter((asset) => asset.id === id);
    if (existingAssets.length === 0) return [];
    const allIncomingAreIdentical = incomingAssets.every((asset) =>
      existingAssets.some(
        (candidate) =>
          candidate.revision === asset.revision &&
          JSON.stringify(candidate) === JSON.stringify(asset),
      ),
    );
    return allIncomingAreIdentical
      ? []
      : [
          {
            kind,
            id,
            incomingRevisions: incomingAssets.map((asset) => asset.revision),
            existingRevisions: existingAssets.map((asset) => asset.revision),
          },
        ];
  });
}

function renameConflictingAssets(
  bundle: ProjectBundle,
  pack: UserAssetPack,
  conflicts: AssetPackConflict[],
) {
  const maps: Record<PackAssetKind, Map<string, string>> = {
    stage: new Map(),
    layout: new Map(),
    effect: new Map(),
    cue: new Map(),
    arrangement: new Map(),
  };
  for (const conflict of conflicts) {
    maps[conflict.kind].set(
      conflict.id,
      uniqueId(`imported-${conflict.id}`, existingIds(bundle, conflict.kind)),
    );
  }
  renameIds(pack.stages, maps.stage);
  renameIds(pack.layouts, maps.layout);
  renameIds(pack.effects, maps.effect);
  renameIds(pack.cues, maps.cue);
  renameIds(pack.arrangements, maps.arrangement);
  for (const stage of pack.stages) remapRef(stage.layout_ref, maps.layout);
  for (const cue of pack.cues) {
    remapRef(cue.compatible_stage_ref, maps.stage);
    for (const layer of cue.layers) {
      remapRef(layer.effect_ref, maps.effect);
      layer.target_set_ref.stage_id =
        maps.stage.get(layer.target_set_ref.stage_id) ?? layer.target_set_ref.stage_id;
      if (layer.targeting_scene_ref) {
        layer.targeting_scene_ref.stage_id =
          maps.stage.get(layer.targeting_scene_ref.stage_id) ?? layer.targeting_scene_ref.stage_id;
      }
    }
  }
  for (const arrangement of pack.arrangements) {
    for (const clip of arrangement.tracks.flatMap((track) => track.clips ?? [])) {
      remapRef(clip.cue_ref, maps.cue);
    }
  }
}

function existingIds(bundle: ProjectBundle, kind: PackAssetKind) {
  if (kind === "stage") return bundle.stages.map((asset) => asset.id);
  if (kind === "layout") return bundle.layouts.map((asset) => asset.id);
  if (kind === "effect") return bundle.effects.map((asset) => asset.id);
  if (kind === "cue") return bundle.cues.map((asset) => asset.id);
  return bundle.arrangements.map((asset) => asset.id);
}

function renameIds<T extends { id: string }>(assets: T[], ids: Map<string, string>) {
  for (const asset of assets) asset.id = ids.get(asset.id) ?? asset.id;
}

function remapRef(reference: AssetRef, ids: Map<string, string>) {
  reference.id = ids.get(reference.id) ?? reference.id;
}

function appendDistinct<T extends { id: string; revision: number }>(target: T[], incoming: T[]) {
  const identities = new Set(target.map(assetKey));
  for (const asset of incoming) {
    if (!identities.has(assetKey(asset))) target.push(structuredClone(asset));
  }
}

function appendRefs(references: AssetRef[], assets: Array<{ id: string; revision: number }>) {
  const identities = new Set(references.map(assetKey));
  for (const asset of assets) {
    const reference = { id: asset.id, revision: asset.revision };
    if (!identities.has(assetKey(reference))) references.push(reference);
  }
}

function cloneAssets<T>(assets: T[]) {
  return structuredClone(assets);
}

function isBuiltinId(id: string) {
  return id.startsWith("builtin.");
}

function slug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "assets"
  );
}

function toIssue(error: ErrorObject) {
  return {
    path: error.instancePath || "$",
    message: error.message ?? "does not match UserAssetPack V1",
  };
}
