import fixtureProfileCatalog from "../../../schemas/fixture-profiles-v1.json";
import type { GroupDSL, LayoutDSL, PatchDSL } from "@/bridge/types";
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

export function buildLayout(
  shape: EditableLayoutShape,
  fixtureIds: number[],
  columns: number,
): LayoutDSL {
  const count = fixtureIds.length;
  const safeColumns = Math.max(1, Math.min(columns, Math.max(count, 1)));
  if (shape === "circle") {
    return {
      type: "generator",
      generator: {
        shape: "circle",
        rings: 1,
        increment: Math.max(1, count - 1),
        gap: 96,
        center: [0, 0],
      },
    };
  }
  if (shape === "formula") {
    return {
      type: "generator",
      generator: {
        shape: "formula",
        formula: {
          x: "cos(t) * 128",
          y: "sin(t) * 128",
          t_range: [0, Math.PI * 2],
          count: Math.max(1, count),
        },
      },
    };
  }
  if (shape === "custom") {
    return {
      type: "generator",
      generator: {
        shape: "custom",
        fixtures: fixtureIds.map((id, index) => ({
          id,
          x: (index % safeColumns) * 64,
          y: Math.floor(index / safeColumns) * 64,
        })),
      },
    };
  }
  return {
    type: "generator",
    generator: {
      shape: "matrix",
      rows: Math.max(1, Math.ceil(count / safeColumns)),
      columns: safeColumns,
      spacing: 64,
      origin: [0, 0],
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

function layoutPositions(layout: LayoutDSL, fixtureIds: number[]) {
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
