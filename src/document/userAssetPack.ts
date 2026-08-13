import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import schema from "../../schemas/user-asset-pack-v1.schema.json";
import { isBeatSyncSpeedMultiplier } from "@/authoring/speedMultipliers";
import type { AssetRef, ProjectBundle, UserAssetPack } from "@/bridge/types";
import {
  builtinArrangements,
  builtinEffects,
  builtinLayouts,
  builtinProjectTemplate,
} from "@/catalog/builtinCatalog";
import { validateProjectBundle } from "./projectBundle";
import { assetKey, exactAsset, uniqueId } from "./projectModel";

type PackAssetKind = "stage" | "layout" | "effect" | "cue" | "arrangement";

export interface AssetPackConflict {
  kind: PackAssetKind;
  id: string;
  name: string;
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

  return createValidatedAssetPack(bundle.manifest.project_id, name, {
    stages,
    layouts: [...layoutRefs.values()].flatMap((reference) => {
      const layout = exactAsset(bundle.layouts, reference);
      return layout ? [layout] : [];
    }),
    effects: [...effectRefs.values()].flatMap((reference) => {
      const effect = exactAsset(bundle.effects, reference);
      return effect ? [effect] : [];
    }),
    cues,
    arrangements: selectedArrangements,
  });
}

export function createBaseAssetPack(): UserAssetPack {
  const template = builtinProjectTemplate();
  return createValidatedAssetPack(template.id, "Base Assets", {
    stages: [template.stage],
    layouts: builtinLayouts,
    effects: builtinEffects,
    cues: template.cues ?? [],
    arrangements: builtinArrangements,
  });
}

function createValidatedAssetPack(
  sourceProjectId: string,
  name: string,
  assets: Pick<UserAssetPack, "stages" | "layouts" | "effects" | "cues" | "arrangements">,
) {
  const pack: UserAssetPack = {
    schema_version: 1,
    id: uniqueId(`asset-pack-${slug(name)}`, []),
    name,
    source_project_id: sourceProjectId,
    stages: cloneAssets(assets.stages),
    layouts: cloneAssets(assets.layouts),
    effects: cloneAssets(assets.effects),
    cues: cloneAssets(assets.cues),
    arrangements: cloneAssets(assets.arrangements),
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
      existing as Array<{ id: string; revision: number; name: string }>,
      incoming as Array<{ id: string; revision: number; name: string }>,
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

export function replaceProjectAssetsFromPack(bundle: ProjectBundle, value: unknown) {
  const validation = validateUserAssetPack(value);
  if (!validation.success) {
    throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }
  const pack = structuredClone(validation.data);
  const conflicts = assetPackConflicts(bundle, pack);
  remapReplacementRevisions(bundle, pack);

  const replacementValidation = validateUserAssetPack(pack);
  if (!replacementValidation.success) {
    throw new Error(
      replacementValidation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"),
    );
  }
  const activeArrangement = pack.arrangements[pack.arrangements.length - 1];
  if (!activeArrangement) {
    throw new Error(
      "This asset pack has no Arrangement and cannot replace a Project. Use incremental import instead.",
    );
  }
  const activeStage = replacementStage(pack, activeArrangement);
  if (!activeStage) {
    throw new Error(
      "This asset pack has no Stage and cannot replace a Project. Use incremental import instead.",
    );
  }

  const next: ProjectBundle = {
    schema_version: 1,
    manifest: {
      schema_version: 1,
      project_id: bundle.manifest.project_id,
      revision: bundle.manifest.revision + 1,
      name: bundle.manifest.name,
      stage_ref: toRef(activeStage),
      layout_refs: pack.layouts.map(toRef),
      effect_refs: pack.effects.map(toRef),
      cue_refs: pack.cues.map(toRef),
      arrangement_refs: pack.arrangements.map(toRef),
      active_arrangement_id: activeArrangement.id,
    },
    stages: cloneAssets(pack.stages),
    layouts: cloneAssets(pack.layouts),
    effects: cloneAssets(pack.effects),
    cues: cloneAssets(pack.cues),
    arrangements: cloneAssets(pack.arrangements),
  };
  const projectValidation = validateProjectBundle(next);
  if (!projectValidation.success) {
    throw new Error(
      `This asset pack cannot replace the current Project: ${projectValidation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  return { bundle: next, conflicts, importedPack: pack };
}

function validateAssetPackReferences(pack: UserAssetPack) {
  const issues: Array<{ path: string; message: string }> = [];
  const layouts = new Set(pack.layouts.map(assetKey));
  const effects = new Set(pack.effects.map(assetKey));
  const cues = new Set(pack.cues.map(assetKey));
  for (const [effectIndex, effect] of pack.effects.entries()) {
    const color = effect.parameters.find((parameter) => parameter.id === "color");
    if (!color) {
      issues.push({
        path: `effects[${effectIndex}].parameters`,
        message: "Effect is missing the standard Color parameter",
      });
    } else if (
      color.schema.type !== "color" ||
      color.scope !== "arrangement" ||
      color.section !== "main"
    ) {
      issues.push({
        path: `effects[${effectIndex}].parameters`,
        message:
          "The standard Color parameter must use color schema, arrangement scope, and the main section",
      });
    }
  }
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
      const speed = layer.parameter_overrides?.speed;
      if (speed?.type === "scalar" && !isBeatSyncSpeedMultiplier(speed.value)) {
        issues.push({
          path: `cues[${cueIndex}].layers[${layerIndex}].parameter_overrides.speed`,
          message: "Speed override must be 0.25, 0.5, 1, 2, 4, or 8",
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
    for (const [trackIndex, track] of arrangement.tracks.entries()) {
      for (const [clipIndex, clip] of (track.clips ?? []).entries()) {
        for (const [overrideIndex, layerOverride] of (clip.layer_overrides ?? []).entries()) {
          const speed = layerOverride.parameter_overrides?.speed;
          if (speed?.type === "scalar" && !isBeatSyncSpeedMultiplier(speed.value)) {
            issues.push({
              path: `arrangements[${arrangementIndex}].tracks[${trackIndex}].clips[${clipIndex}].layer_overrides[${overrideIndex}].parameter_overrides.speed`,
              message: "Speed override must be 0.25, 0.5, 1, 2, 4, or 8",
            });
          }
        }
      }
      for (const [laneIndex, lane] of (track.automation_lanes ?? []).entries()) {
        if (lane.target.parameter_id !== "speed") continue;
        for (const [keyframeIndex, keyframe] of lane.keyframes.entries()) {
          if (
            keyframe.value.type === "scalar" &&
            !isBeatSyncSpeedMultiplier(keyframe.value.value)
          ) {
            issues.push({
              path: `arrangements[${arrangementIndex}].tracks[${trackIndex}].automation_lanes[${laneIndex}].keyframes[${keyframeIndex}].value`,
              message: "Speed automation must be 0.25, 0.5, 1, 2, 4, or 8",
            });
          }
        }
      }
    }
  }
  return issues;
}

function conflictsForKind<T extends { id: string; revision: number; name: string }>(
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
            name: incomingAssets[incomingAssets.length - 1]?.name ?? id,
            incomingRevisions: incomingAssets.map((asset) => asset.revision),
            existingRevisions: existingAssets.map((asset) => asset.revision),
          },
        ];
  });
}

function remapReplacementRevisions(bundle: ProjectBundle, pack: UserAssetPack) {
  const maps: Record<PackAssetKind, Map<string, AssetRef>> = {
    stage: new Map(),
    layout: new Map(),
    effect: new Map(),
    cue: new Map(),
    arrangement: new Map(),
  };
  remapAssetRevisions(bundle.stages, pack.stages, maps.stage);
  remapAssetRevisions(bundle.layouts, pack.layouts, maps.layout);
  remapAssetRevisions(bundle.effects, pack.effects, maps.effect);
  remapAssetRevisions(bundle.cues, pack.cues, maps.cue);
  remapAssetRevisions(bundle.arrangements, pack.arrangements, maps.arrangement);

  for (const stage of pack.stages) remapExactRef(stage.layout_ref, maps.layout);
  for (const cue of pack.cues) {
    remapExactRef(cue.compatible_stage_ref, maps.stage);
    for (const layer of cue.layers) {
      remapExactRef(layer.effect_ref, maps.effect);
      const targetStage = remappedRef(
        {
          id: layer.target_set_ref.stage_id,
          revision: layer.target_set_ref.stage_revision,
        },
        maps.stage,
      );
      layer.target_set_ref.stage_id = targetStage.id;
      layer.target_set_ref.stage_revision = targetStage.revision;
      if (layer.targeting_scene_ref) {
        const sceneStage = remappedRef(
          {
            id: layer.targeting_scene_ref.stage_id,
            revision: layer.targeting_scene_ref.stage_revision,
          },
          maps.stage,
        );
        layer.targeting_scene_ref.stage_id = sceneStage.id;
        layer.targeting_scene_ref.stage_revision = sceneStage.revision;
      }
    }
  }
  for (const arrangement of pack.arrangements) {
    for (const clip of arrangement.tracks.flatMap((track) => track.clips ?? [])) {
      remapExactRef(clip.cue_ref, maps.cue);
    }
  }
}

function remapAssetRevisions<T extends { id: string; revision: number }>(
  existing: T[],
  incoming: T[],
  references: Map<string, AssetRef>,
) {
  const nextRevision = new Map<string, number>();
  for (const asset of [...existing, ...incoming]) {
    nextRevision.set(asset.id, Math.max(nextRevision.get(asset.id) ?? 0, asset.revision));
  }
  for (const asset of incoming) {
    const sameId = existing.filter((candidate) => candidate.id === asset.id);
    if (sameId.length === 0) continue;
    const identical = sameId.some(
      (candidate) =>
        candidate.revision === asset.revision &&
        JSON.stringify(candidate) === JSON.stringify(asset),
    );
    if (identical) continue;
    const previous = { id: asset.id, revision: asset.revision };
    const revision = (nextRevision.get(asset.id) ?? 0) + 1;
    nextRevision.set(asset.id, revision);
    asset.revision = revision;
    references.set(assetKey(previous), { id: asset.id, revision });
  }
}

function replacementStage(pack: UserAssetPack, arrangement: UserAssetPack["arrangements"][number]) {
  const cueRefs = arrangement.tracks
    .flatMap((track) => track.clips ?? [])
    .map((clip) => clip.cue_ref);
  for (const cueRef of [...cueRefs].reverse()) {
    const cue = pack.cues.find((candidate) => assetKey(candidate) === assetKey(cueRef));
    const stage = cue
      ? pack.stages.find((candidate) => assetKey(candidate) === assetKey(cue.compatible_stage_ref))
      : undefined;
    if (stage) return stage;
  }
  const lastCue = pack.cues[pack.cues.length - 1];
  return (
    (lastCue
      ? pack.stages.find(
          (candidate) => assetKey(candidate) === assetKey(lastCue.compatible_stage_ref),
        )
      : undefined) ?? pack.stages[pack.stages.length - 1]
  );
}

function remapExactRef(reference: AssetRef, references: Map<string, AssetRef>) {
  Object.assign(reference, remappedRef(reference, references));
}

function remappedRef(reference: AssetRef, references: Map<string, AssetRef>) {
  return references.get(assetKey(reference)) ?? reference;
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

function toRef(asset: { id: string; revision: number }): AssetRef {
  return { id: asset.id, revision: asset.revision };
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
