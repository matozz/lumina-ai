import type {
  ArrangementDocument,
  AssetRef,
  CueDefinition,
  CueLayer,
  EffectDefinitionDocument,
  LayoutDefinition,
  ProjectBundle,
  StageDocument,
} from "@/bridge/types";
import { buildCommonParameters, buildEffectGraph } from "@/workspace/effect-lab/effectGraph";
import type { EffectFormValues } from "@/workspace/effect-lab/effectFactory";

export type ProjectAssetKind = "stage" | "layout" | "effect" | "cue" | "arrangement";

export function assetKey(reference: AssetRef) {
  return `${reference.id}@${reference.revision}`;
}

export function latestRefsById(references: AssetRef[]) {
  const latest = new Map<string, AssetRef>();
  for (const reference of references) {
    const current = latest.get(reference.id);
    if (!current || reference.revision > current.revision) latest.set(reference.id, reference);
  }
  return [...latest.values()];
}

export function exactAsset<T extends { id: string; revision: number }>(
  assets: T[],
  reference: AssetRef | null,
) {
  if (!reference) return undefined;
  return assets.find((asset) => asset.id === reference.id && asset.revision === reference.revision);
}

export function activeArrangementRef(bundle: ProjectBundle): AssetRef {
  return (
    [...bundle.manifest.arrangement_refs]
      .reverse()
      .find((reference) => reference.id === bundle.manifest.active_arrangement_id) ??
    bundle.manifest.arrangement_refs[0]
  );
}

export function activeStage(bundle: ProjectBundle): StageDocument {
  const stage = exactAsset(bundle.stages, bundle.manifest.stage_ref);
  if (!stage) throw new Error("Project Stage reference is missing");
  return stage;
}

export function activeLayout(bundle: ProjectBundle): LayoutDefinition {
  const stage = activeStage(bundle);
  const layout = exactAsset(bundle.layouts, stage.layout_ref);
  if (!layout) throw new Error("Stage Layout reference is missing");
  return layout;
}

export function createEffectAsset(bundle: ProjectBundle, requestedName = "Pulse") {
  const name = uniqueName(
    requestedName,
    bundle.effects.map((effect) => effect.name),
  );
  const id = uniqueId(
    slug(name),
    bundle.effects.map((effect) => effect.id),
  );
  const gradient = /gradient/i.test(name);
  const values: EffectFormValues = {
    name,
    targetGroupId: "all",
    attributeMode: "intensity_color",
    waveform: gradient ? "sine" : "pulse",
    speed: gradient ? 0.5 : 1,
    phase: 0,
    width: gradient ? 100 : 50,
    transition: gradient ? 100 : 12,
    color: gradient ? "#6e8bff" : "#ff2d55",
  };
  const graph = buildEffectGraph(values);
  const spatial = graph.find((node) => node.type === "spatial_phase");
  if (gradient && spatial?.type === "spatial_phase") spatial.to = 1;
  const effect: EffectDefinitionDocument = {
    schema_version: 1,
    id,
    revision: 1,
    name,
    source: "project_local",
    parameters: buildCommonParameters(values),
    graph: { nodes: graph },
    catalog: {
      mood: gradient ? ["expansive"] : ["driving"],
      energy: gradient ? 0.45 : 0.7,
      density: gradient ? 0.7 : 0.55,
      motion: gradient ? "sweep" : "pulse",
      colorfulness: 1,
      strobe_risk: "low",
      required_attributes: ["intensity", "color.rgb"],
    },
  };
  return effect;
}

export function createCueAsset(
  bundle: ProjectBundle,
  effectRefs: AssetRef[],
  requestedName = "New Cue",
) {
  if (effectRefs.length === 0) throw new Error("A Cue needs at least one Effect layer");
  const stage = activeStage(bundle);
  const name = uniqueName(
    requestedName,
    bundle.cues.map((cue) => cue.name),
  );
  const id = uniqueId(
    slug(name),
    bundle.cues.map((cue) => cue.id),
  );
  const targetIds = stage.target_sets.map((target) => target.id);
  const layers: CueLayer[] = effectRefs.map((effectRef, index) => ({
    id: uniqueId(
      `${effectRef.id}-layer`,
      effectRefs.slice(0, index).map((reference) => `${reference.id}-layer`),
    ),
    effect_ref: { ...effectRef },
    target_set_ref: {
      stage_id: stage.id,
      stage_revision: stage.revision,
      target_set_id: targetIds[index] ?? targetIds[0] ?? "all",
    },
    parameter_overrides: {},
    phase: 0,
    seed: stableSeed(`${id}:${effectRef.id}:${index}`),
    layer: index,
    priority: 0,
    mix_overrides: [],
    trigger_policy: { mode: "timeline", quantize: "beat" },
  }));
  const requiredAttributes = new Set<string>();
  let strobeRisk: CueDefinition["risk_summary"]["strobe_risk"] = "none";
  for (const reference of effectRefs) {
    const effect = exactAsset(bundle.effects, reference);
    for (const attribute of effect?.catalog.required_attributes ?? []) {
      requiredAttributes.add(attribute);
    }
    if (effect?.catalog.strobe_risk === "high") strobeRisk = "high";
    else if (effect?.catalog.strobe_risk === "medium" && strobeRisk !== "high") {
      strobeRisk = "medium";
    } else if (effect?.catalog.strobe_risk === "low" && strobeRisk === "none") {
      strobeRisk = "low";
    }
  }
  const cue: CueDefinition = {
    schema_version: 2,
    id,
    revision: 1,
    name,
    compatible_stage_ref: { id: stage.id, revision: stage.revision },
    nominal_length_ticks: 3_840,
    layers,
    automation_lanes: [],
    trigger_policy: { mode: "timeline", quantize: "beat" },
    capability_summary: { required_attributes: [...requiredAttributes] },
    risk_summary: { strobe_risk: strobeRisk },
  };
  return cue;
}

export function duplicateArrangementAsset(
  bundle: ProjectBundle,
  source: ArrangementDocument,
  requestedName = `${source.name} Copy`,
) {
  const name = uniqueName(
    requestedName,
    bundle.arrangements.map((arrangement) => arrangement.name),
  );
  return {
    ...structuredClone(source),
    id: uniqueId(
      slug(name),
      bundle.arrangements.map((arrangement) => arrangement.id),
    ),
    revision: 1,
    name,
  } satisfies ArrangementDocument;
}

export function bumpManifestRevision(bundle: ProjectBundle, published: ProjectBundle | null) {
  if (
    published &&
    published.manifest.project_id === bundle.manifest.project_id &&
    published.manifest.revision === bundle.manifest.revision
  ) {
    bundle.manifest.revision = Math.max(
      bundle.manifest.revision + 1,
      published.manifest.revision + 1,
    );
  }
}

export function forkAssetRevision(
  bundle: ProjectBundle,
  published: ProjectBundle | null,
  kind: ProjectAssetKind,
  reference: AssetRef,
): AssetRef {
  if (!published || !publishedHasReference(published, kind, reference)) return reference;
  const nextRef =
    kind === "stage"
      ? cloneNextRevision(bundle.stages, reference)
      : kind === "layout"
        ? cloneNextRevision(bundle.layouts, reference)
        : kind === "effect"
          ? cloneNextRevision(bundle.effects, reference)
          : kind === "cue"
            ? cloneNextRevision(bundle.cues, reference)
            : cloneNextRevision(bundle.arrangements, reference);
  if (kind === "stage") bundle.manifest.stage_ref = nextRef;
  else appendExactRef(manifestRefs(bundle, kind), nextRef);
  bumpManifestRevision(bundle, published);
  return nextRef;
}

export function cloneAssetRevision(
  bundle: ProjectBundle,
  kind: ProjectAssetKind,
  reference: AssetRef,
): AssetRef {
  const nextRef =
    kind === "stage"
      ? cloneNextRevision(bundle.stages, reference)
      : kind === "layout"
        ? cloneNextRevision(bundle.layouts, reference)
        : kind === "effect"
          ? cloneNextRevision(bundle.effects, reference)
          : kind === "cue"
            ? cloneNextRevision(bundle.cues, reference)
            : cloneNextRevision(bundle.arrangements, reference);
  if (kind === "stage") bundle.manifest.stage_ref = nextRef;
  else appendExactRef(manifestRefs(bundle, kind), nextRef);
  return nextRef;
}

export function appendExactRef(references: AssetRef[], reference: AssetRef) {
  if (!references.some((candidate) => assetKey(candidate) === assetKey(reference))) {
    references.push(reference);
  }
}

function cloneNextRevision<T extends { id: string; revision: number }>(
  assets: T[],
  reference: AssetRef,
) {
  const current = exactAsset(assets, reference);
  if (!current) throw new Error(`Missing asset ${assetKey(reference)}`);
  const revision =
    Math.max(
      0,
      ...assets.filter((asset) => asset.id === reference.id).map((asset) => asset.revision),
    ) + 1;
  const next = structuredClone(current);
  next.revision = revision;
  assets.push(next);
  return { id: next.id, revision };
}

function manifestRefs(bundle: ProjectBundle, kind: Exclude<ProjectAssetKind, "stage">) {
  if (kind === "layout") return bundle.manifest.layout_refs;
  if (kind === "effect") return bundle.manifest.effect_refs;
  if (kind === "cue") return bundle.manifest.cue_refs;
  return bundle.manifest.arrangement_refs;
}

function publishedHasReference(bundle: ProjectBundle, kind: ProjectAssetKind, reference: AssetRef) {
  if (kind === "stage") return assetKey(bundle.manifest.stage_ref) === assetKey(reference);
  return manifestRefs(bundle, kind).some(
    (candidate) => assetKey(candidate) === assetKey(reference),
  );
}

export function uniqueId(base: string, existing: string[]) {
  let candidate = base;
  let suffix = 2;
  while (existing.includes(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function uniqueName(base: string, existing: string[]) {
  let candidate = base;
  let suffix = 2;
  while (existing.includes(candidate)) {
    candidate = `${base} ${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function slug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "asset"
  );
}

function stableSeed(value: string) {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
