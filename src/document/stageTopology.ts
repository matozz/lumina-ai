import type {
  ArrangementDocument,
  AssetRef,
  LayoutDefinition,
  ProjectBundle,
  StageDocument,
  TargetSetDefinition,
} from "@/bridge/types";
import {
  fixtureIdsForStage,
  layoutCapacity,
  layoutGridDimensions,
  layoutPositions,
} from "./layoutDefinition";
import { assetKey, exactAsset } from "./projectModel";

export interface ResolvedTargetSet {
  fixtureIds: number[];
  partitions: number[][];
}

export interface TargetSetTopologyImpact {
  id: string;
  name: string;
  valid: boolean;
  membershipChanged: boolean;
  beforeCount: number;
  afterCount: number;
  beforePartitions: number;
  afterPartitions: number;
  reason: string | null;
}

export interface StageTopologyImpact {
  compatible: boolean;
  currentLayoutRef: AssetRef;
  candidateLayoutRef: AssetRef;
  fixtureCount: number;
  currentCapacity: number;
  candidateCapacity: number;
  movedFixtureCount: number | null;
  groups: Array<{ id: string; name: string; fixtureCount: number }>;
  targetSets: TargetSetTopologyImpact[];
  cues: Array<{ reference: AssetRef; name: string; layers: number }>;
  arrangements: Array<{ reference: AssetRef; name: string; clipCount: number }>;
  validTargetSetIds: string[];
}

export function analyzeStageTopology(
  bundle: ProjectBundle,
  candidateLayoutRef: AssetRef,
): StageTopologyImpact {
  const stage = exactAsset(bundle.stages, bundle.manifest.stage_ref);
  if (!stage) throw new Error("Project Stage reference is missing");
  const currentLayout = exactAsset(bundle.layouts, stage.layout_ref);
  const candidateLayout = exactAsset(bundle.layouts, candidateLayoutRef);
  if (!currentLayout || !candidateLayout) throw new Error("Layout revision is missing");
  const fixtureIds = fixtureIdsForStage(stage);
  const targetSets = stage.target_sets.map((target) =>
    targetSetImpact(stage, currentLayout, candidateLayout, target),
  );
  const cues = bundle.manifest.cue_refs.flatMap((reference) => {
    const cue = exactAsset(bundle.cues, reference);
    return cue && assetKey(cue.compatible_stage_ref) === assetKey(stage)
      ? [{ reference, name: cue.name, layers: cue.layers.length }]
      : [];
  });
  const cueKeys = new Set(cues.map((cue) => assetKey(cue.reference)));
  const arrangements = bundle.manifest.arrangement_refs.flatMap((reference) => {
    const arrangement = exactAsset(bundle.arrangements, reference);
    if (!arrangement) return [];
    const clipCount = clipsForArrangement(arrangement).filter((clip) =>
      cueKeys.has(assetKey(clip.cue_ref)),
    ).length;
    return clipCount > 0 ? [{ reference, name: arrangement.name, clipCount }] : [];
  });
  const movedFixtureCount = countMovedFixtures(currentLayout, candidateLayout, fixtureIds);
  return {
    compatible:
      layoutCapacity(candidateLayout) >= fixtureIds.length &&
      targetSets.every((target) => target.valid && !target.membershipChanged),
    currentLayoutRef: stage.layout_ref,
    candidateLayoutRef,
    fixtureCount: fixtureIds.length,
    currentCapacity: layoutCapacity(currentLayout),
    candidateCapacity: layoutCapacity(candidateLayout),
    movedFixtureCount,
    groups: stage.groups.map((group) => ({
      id: group.id,
      name: group.name,
      fixtureCount: groupFixtureCount(group.fixtures),
    })),
    targetSets,
    cues,
    arrangements,
    validTargetSetIds: targetSets.filter((target) => target.valid).map((target) => target.id),
  };
}

export function resolveTargetSet(
  stage: StageDocument,
  layout: LayoutDefinition,
  target: TargetSetDefinition,
): ResolvedTargetSet | null {
  const fixtureIds = fixtureIdsForStage(stage);
  const dimensions = layoutGridDimensions(layout);
  if (!dimensions) {
    if (target.selector.type === "all") {
      return { fixtureIds, partitions: [fixtureIds] };
    }
    if (target.selector.type === "fixture_ids") {
      const selected = target.selector.fixture_ids.filter((id) => fixtureIds.includes(id));
      return selected.length === target.selector.fixture_ids.length
        ? { fixtureIds: selected, partitions: [selected] }
        : null;
    }
    return null;
  }
  const [rows, columns] = dimensions;
  const cells = fixtureIds.map((id, index) => ({
    id,
    row: Math.floor(index / columns),
    column: index % columns,
  }));
  const selector = target.selector;
  let partitions: number[][];
  switch (selector.type) {
    case "all":
      partitions = [fixtureIds];
      break;
    case "fixture_ids":
      if (selector.fixture_ids.some((id) => !fixtureIds.includes(id))) return null;
      partitions = [selector.fixture_ids];
      break;
    case "rows":
      if (selector.indices.some((index) => index < 0 || index >= rows)) return null;
      partitions = selector.indices.map((row) =>
        cells.filter((cell) => cell.row === row).map((cell) => cell.id),
      );
      break;
    case "columns":
      if (selector.indices.some((index) => index < 0 || index >= columns)) return null;
      partitions = selector.indices.map((column) =>
        cells.filter((cell) => cell.column === column).map((cell) => cell.id),
      );
      break;
    case "grid_zones":
      if (
        selector.rows < 1 ||
        selector.columns < 1 ||
        selector.zones.length === 0 ||
        selector.zones.some(
          (zone) =>
            zone.row < 0 ||
            zone.row >= selector.rows ||
            zone.column < 0 ||
            zone.column >= selector.columns,
        )
      ) {
        return null;
      }
      partitions = selector.zones.map((zone) =>
        cells
          .filter(
            (cell) =>
              Math.floor((cell.row * selector.rows) / Math.max(1, rows)) === zone.row &&
              Math.floor((cell.column * selector.columns) / Math.max(1, columns)) === zone.column,
          )
          .map((cell) => cell.id),
      );
      break;
    case "checkerboard":
      partitions = [
        cells
          .filter((cell) => (cell.row + cell.column) % 2 === (selector.parity === "even" ? 0 : 1))
          .map((cell) => cell.id),
      ];
      break;
    case "center_edges": {
      if (selector.thickness < 1 || selector.thickness * 2 > Math.min(rows, columns)) return null;
      partitions = [
        cells
          .filter((cell) => {
            const edge =
              cell.row < selector.thickness ||
              cell.column < selector.thickness ||
              cell.row >= rows - selector.thickness ||
              cell.column >= columns - selector.thickness;
            return selector.region === "edges" ? edge : !edge;
          })
          .map((cell) => cell.id),
      ];
      break;
    }
  }
  return {
    fixtureIds: [...new Set(partitions.flat())].sort((left, right) => left - right),
    partitions,
  };
}

function targetSetImpact(
  stage: StageDocument,
  currentLayout: LayoutDefinition,
  candidateLayout: LayoutDefinition,
  target: TargetSetDefinition,
): TargetSetTopologyImpact {
  const before = resolveTargetSet(stage, currentLayout, target);
  const after = resolveTargetSet(stage, candidateLayout, target);
  return {
    id: target.id,
    name: target.name,
    valid: after !== null,
    membershipChanged: before !== null && after !== null && !samePartitions(before, after),
    beforeCount: before?.fixtureIds.length ?? 0,
    afterCount: after?.fixtureIds.length ?? 0,
    beforePartitions: before?.partitions.length ?? 0,
    afterPartitions: after?.partitions.length ?? 0,
    reason: after
      ? before && !samePartitions(before, after)
        ? "Fixture membership or partition order changes on the candidate grid."
        : null
      : "Selector is not valid for the candidate Layout topology.",
  };
}

function samePartitions(left: ResolvedTargetSet, right: ResolvedTargetSet) {
  return JSON.stringify(left.partitions) === JSON.stringify(right.partitions);
}

function countMovedFixtures(
  currentLayout: LayoutDefinition,
  candidateLayout: LayoutDefinition,
  fixtureIds: number[],
) {
  const before = layoutPositions(currentLayout, fixtureIds);
  const after = layoutPositions(candidateLayout, fixtureIds);
  if (before.length !== fixtureIds.length || after.length !== fixtureIds.length) return null;
  const current = new Map(before.map((fixture) => [fixture.id, fixture]));
  return after.filter((fixture) => {
    const previous = current.get(fixture.id);
    return !previous || previous.x !== fixture.x || previous.y !== fixture.y;
  }).length;
}

function groupFixtureCount(fixtures: StageDocument["groups"][number]["fixtures"]) {
  return Array.isArray(fixtures) ? fixtures.length : fixtures.range[1] - fixtures.range[0] + 1;
}

function clipsForArrangement(arrangement: ArrangementDocument) {
  return arrangement.tracks.flatMap((track) => track.clips ?? []);
}
