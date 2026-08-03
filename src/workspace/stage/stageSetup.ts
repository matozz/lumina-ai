import fixtureProfileCatalog from "../../../schemas/fixture-profiles-v1.json";
import type { CustomFixturePos, GroupDSL, LayoutDSL, PatchDSL } from "@/bridge/types";
import type { PatchAddress } from "@/stores/workspace";

interface FixtureProfileAttribute {
  id: string;
  value_type: "scalar" | "color" | "angle" | "enum" | "boolean";
  output_mapping: { channel_offsets: number[]; encoding: string };
}

export interface FixtureProfileSummary {
  id: string;
  name: string;
  preview_kind: "pixel" | "moving_head";
  attributes: FixtureProfileAttribute[];
}

export interface PatchDiagnostic {
  severity: "warning" | "error";
  message: string;
}

export const fixtureProfiles = fixtureProfileCatalog.profiles as FixtureProfileSummary[];

export function profileById(profileId: string) {
  return fixtureProfiles.find((profile) => profile.id === profileId) ?? fixtureProfiles[0];
}

export function channelFootprint(profile: FixtureProfileSummary) {
  return (
    Math.max(
      -1,
      ...profile.attributes.flatMap((attribute) => attribute.output_mapping.channel_offsets),
    ) + 1
  );
}

export function diagnosePatch(patch: PatchDSL[], addresses: PatchAddress[]): PatchDiagnostic[] {
  const diagnostics: PatchDiagnostic[] = [];
  const allocations = patch.map((item, index) => {
    const address = addresses[index] ?? { universe: 1, startChannel: 1 };
    const profile = profileById(item.profile_id);
    const [firstId, lastId] = item.id_range;
    const validIdRange =
      Number.isInteger(firstId) && Number.isInteger(lastId) && firstId > 0 && lastId >= firstId;
    if (!validIdRange) {
      diagnostics.push({
        severity: "error",
        message: `Patch ${index + 1} needs a positive fixture ID range.`,
      });
    }
    const count = validIdRange ? lastId - firstId + 1 : 0;
    const endChannel = address.startChannel + count * channelFootprint(profile) - 1;
    if (!Number.isInteger(address.universe) || address.universe < 1) {
      diagnostics.push({
        severity: "error",
        message: `Patch ${index + 1} needs a positive universe.`,
      });
    }
    if (
      !Number.isInteger(address.startChannel) ||
      address.startChannel < 1 ||
      address.startChannel > 512
    ) {
      diagnostics.push({
        severity: "error",
        message: `Patch ${index + 1} start channel must be between 1 and 512.`,
      });
    }
    if (endChannel > 512) {
      diagnostics.push({
        severity: "error",
        message: `Patch ${index + 1} ends at channel ${endChannel}; split it before channel 512.`,
      });
    }
    return { index, universe: address.universe, start: address.startChannel, end: endChannel };
  });

  for (let left = 0; left < allocations.length; left += 1) {
    for (let right = left + 1; right < allocations.length; right += 1) {
      const a = allocations[left];
      const b = allocations[right];
      if (a.universe === b.universe && a.start <= b.end && b.start <= a.end) {
        diagnostics.push({
          severity: "error",
          message: `Patch ${a.index + 1} and ${b.index + 1} overlap on universe ${a.universe}.`,
        });
      }
    }
  }

  return diagnostics;
}

export type EditableLayoutShape = "matrix" | "circle" | "formula" | "custom";
export type SpatialFilter = "all" | "left" | "right" | "top" | "bottom";

export interface StageLayoutParameters {
  columns: number;
  spacing: number;
  originX: number;
  originY: number;
  rings: number;
  increment: number;
  gap: number;
  centerX: number;
  centerY: number;
  formulaX: string;
  formulaY: string;
  tStart: number;
  tEnd: number;
  scale: number;
  customFixtures: CustomFixturePos[];
}

export function layoutParametersFromLayout(
  layout: LayoutDSL | null | undefined,
  fixtureIds: number[],
): StageLayoutParameters {
  const defaults = defaultLayoutParameters(fixtureIds);
  const generator = layout?.generator;
  if (!generator) return defaults;
  if (generator.shape === "matrix") {
    return {
      ...defaults,
      columns: generator.columns,
      spacing: generator.spacing,
      originX: generator.origin?.[0] ?? 0,
      originY: generator.origin?.[1] ?? 0,
    };
  }
  if (generator.shape === "circle") {
    return {
      ...defaults,
      rings: generator.rings,
      increment: generator.increment,
      gap: generator.gap,
      centerX: generator.center?.[0] ?? 0,
      centerY: generator.center?.[1] ?? 0,
    };
  }
  if (generator.shape === "formula") {
    return {
      ...defaults,
      formulaX: generator.formula.x,
      formulaY: generator.formula.y,
      tStart: generator.formula.t_range[0],
      tEnd: generator.formula.t_range[1],
      scale: generator.formula.scale ?? 1,
    };
  }
  if (generator.shape === "custom") {
    return { ...defaults, customFixtures: generator.fixtures };
  }
  return defaults;
}

export function diagnoseLayout(
  shape: EditableLayoutShape,
  fixtureIds: number[],
  parameters: StageLayoutParameters,
): PatchDiagnostic[] {
  const invalidNumber = (value: number) => !Number.isFinite(value);
  if (shape === "matrix") {
    if (!Number.isInteger(parameters.columns) || parameters.columns < 1) {
      return [{ severity: "error", message: "Layout columns must be a positive integer." }];
    }
    if (invalidNumber(parameters.spacing) || parameters.spacing <= 0) {
      return [{ severity: "error", message: "Matrix spacing must be greater than zero." }];
    }
    if (invalidNumber(parameters.originX) || invalidNumber(parameters.originY)) {
      return [{ severity: "error", message: "Matrix origin must use finite coordinates." }];
    }
  }
  if (shape === "circle") {
    if (
      !Number.isInteger(parameters.rings) ||
      parameters.rings < 1 ||
      !Number.isInteger(parameters.increment) ||
      parameters.increment < 1
    ) {
      return [
        { severity: "error", message: "Circle rings and increment must be positive integers." },
      ];
    }
    if (invalidNumber(parameters.gap) || parameters.gap <= 0) {
      return [{ severity: "error", message: "Circle ring gap must be greater than zero." }];
    }
    if (invalidNumber(parameters.centerX) || invalidNumber(parameters.centerY)) {
      return [{ severity: "error", message: "Circle center must use finite coordinates." }];
    }
    const capacity = 1 + (parameters.increment * parameters.rings * (parameters.rings + 1)) / 2;
    if (capacity < fixtureIds.length) {
      return [
        {
          severity: "error",
          message: `Circle layout fits ${capacity} fixtures; increase rings or increment for ${fixtureIds.length}.`,
        },
      ];
    }
  }
  if (shape === "formula") {
    if (!parameters.formulaX.trim() || !parameters.formulaY.trim()) {
      return [{ severity: "error", message: "Formula X and Y expressions are required." }];
    }
    if (
      invalidNumber(parameters.tStart) ||
      invalidNumber(parameters.tEnd) ||
      parameters.tEnd <= parameters.tStart
    ) {
      return [{ severity: "error", message: "Formula t end must be greater than t start." }];
    }
    if (invalidNumber(parameters.scale) || parameters.scale <= 0) {
      return [{ severity: "error", message: "Formula scale must be greater than zero." }];
    }
  }
  if (shape === "custom") {
    const positions = reconcileCustomFixtures(fixtureIds, parameters);
    if (positions.some(({ x, y }) => invalidNumber(x) || invalidNumber(y))) {
      return [
        { severity: "error", message: "Every custom fixture needs finite X and Y coordinates." },
      ];
    }
  }
  return [];
}

export function buildLayout(
  shape: EditableLayoutShape,
  fixtureIds: number[],
  parameters: StageLayoutParameters,
): LayoutDSL {
  const count = fixtureIds.length;
  const safeColumns = Math.max(1, Math.min(parameters.columns, Math.max(count, 1)));
  if (shape === "circle") {
    return {
      type: "generator",
      generator: {
        shape: "circle",
        rings: parameters.rings,
        increment: parameters.increment,
        gap: parameters.gap,
        center: [parameters.centerX, parameters.centerY],
      },
    };
  }
  if (shape === "formula") {
    return {
      type: "generator",
      generator: {
        shape: "formula",
        formula: {
          x: parameters.formulaX,
          y: parameters.formulaY,
          t_range: [parameters.tStart, parameters.tEnd],
          count: Math.max(1, count),
          scale: parameters.scale,
        },
      },
    };
  }
  if (shape === "custom") {
    return {
      type: "generator",
      generator: {
        shape: "custom",
        fixtures: reconcileCustomFixtures(fixtureIds, parameters),
      },
    };
  }
  return {
    type: "generator",
    generator: {
      shape: "matrix",
      rows: Math.max(1, Math.ceil(count / safeColumns)),
      columns: safeColumns,
      spacing: parameters.spacing,
      origin: [parameters.originX, parameters.originY],
    },
  };
}

export function fixtureIdsForPatch(patch: PatchDSL[]) {
  return patch.flatMap((item) =>
    Array.from(
      { length: Math.max(0, item.id_range[1] - item.id_range[0] + 1) },
      (_, index) => item.id_range[0] + index,
    ),
  );
}

export function groupFixtureIds(group: GroupDSL) {
  if (Array.isArray(group.fixtures)) return group.fixtures;
  const [start, end] = group.fixtures.range;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function fixtureIdsBySpatialFilter(
  layout: LayoutDSL,
  fixtureIds: number[],
  filter: SpatialFilter,
) {
  if (filter === "all") return fixtureIds;
  const positions = layoutPositions(layout, fixtureIds);
  if (positions.length === 0) return fixtureIds;
  const xs = positions.map((position) => position.x);
  const ys = positions.map((position) => position.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  return positions
    .filter((position) => {
      if (filter === "left") return position.x <= centerX;
      if (filter === "right") return position.x > centerX;
      if (filter === "top") return position.y <= centerY;
      return position.y > centerY;
    })
    .map((position) => position.id);
}

export function layoutPositions(layout: LayoutDSL, fixtureIds: number[]) {
  const generator = layout.generator;
  if (generator.shape === "custom") return generator.fixtures;
  if (generator.shape === "matrix") {
    const [originX, originY] = generator.origin ?? [0, 0];
    return fixtureIds.slice(0, generator.rows * generator.columns).map((id, index) => ({
      id,
      x: originX + (index % generator.columns) * generator.spacing,
      y: originY + Math.floor(index / generator.columns) * generator.spacing,
    }));
  }
  if (generator.shape === "circle") {
    const [centerX, centerY] = generator.center ?? [0, 0];
    const positions = fixtureIds.length > 0 ? [{ id: fixtureIds[0], x: centerX, y: centerY }] : [];
    let index = 1;
    for (let ring = 1; ring <= generator.rings && index < fixtureIds.length; ring += 1) {
      const count = generator.increment * ring;
      for (let step = 0; step < count && index < fixtureIds.length; step += 1) {
        const angle = (step / count) * Math.PI * 2;
        positions.push({
          id: fixtureIds[index],
          x: centerX + Math.cos(angle) * generator.gap * ring,
          y: centerY + Math.sin(angle) * generator.gap * ring,
        });
        index += 1;
      }
    }
    return positions;
  }
  return [];
}

function defaultLayoutParameters(fixtureIds: number[]): StageLayoutParameters {
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, fixtureIds.length))));
  return {
    columns,
    spacing: 64,
    originX: 0,
    originY: 0,
    rings: 1,
    increment: Math.max(1, fixtureIds.length - 1),
    gap: 96,
    centerX: 0,
    centerY: 0,
    formulaX: "cos(t) * 128",
    formulaY: "sin(t) * 128",
    tStart: 0,
    tEnd: Math.PI * 2,
    scale: 1,
    customFixtures: fixtureIds.map((id, index) => ({
      id,
      x: (index % columns) * 64,
      y: Math.floor(index / columns) * 64,
    })),
  };
}

function reconcileCustomFixtures(
  fixtureIds: number[],
  parameters: StageLayoutParameters,
): CustomFixturePos[] {
  const existing = new Map(parameters.customFixtures.map((fixture) => [fixture.id, fixture]));
  const columns = Math.max(1, Math.min(parameters.columns, Math.max(1, fixtureIds.length)));
  return fixtureIds.map(
    (id, index) =>
      existing.get(id) ?? {
        id,
        x: parameters.originX + (index % columns) * parameters.spacing,
        y: parameters.originY + Math.floor(index / columns) * parameters.spacing,
      },
  );
}

export function uniqueGroupId(name: string, groups: GroupDSL[]) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "group";
  let candidate = base;
  let suffix = 2;
  while (groups.some((group) => group.id === candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
