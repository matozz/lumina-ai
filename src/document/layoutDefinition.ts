import type {
  CustomFixturePos,
  LayoutDefinition,
  LayoutGeometry,
  ProjectBundle,
  StageDocument,
} from "@/bridge/types";
import { assetKey } from "./projectModel";

const METRIC_EPSILON = 0.000_001;

export interface LayoutDiagnostic {
  code: string;
  path: string;
  message: string;
  recovery: string;
}

export function fixtureIdsForStage(stage: StageDocument) {
  return stage.patch.flatMap((item) =>
    Array.from(
      { length: Math.max(0, item.id_range[1] - item.id_range[0] + 1) },
      (_, index) => item.id_range[0] + index,
    ),
  );
}

export function layoutCapacity(layout: LayoutDefinition) {
  const geometry = layout.geometry;
  switch (geometry.shape) {
    case "matrix":
    case "wall":
      return geometry.rows * geometry.columns;
    case "circle":
      return 1 + (geometry.increment * geometry.rings * (geometry.rings + 1)) / 2;
    case "strip":
    case "algorithm":
      return geometry.count;
    case "frame":
      return Math.max(0, 2 * (geometry.rows + geometry.columns) - 4);
    case "formula":
      return geometry.formula.count;
    case "svg_path":
      return geometry.svg_path.sample_count;
    case "custom":
      return geometry.fixtures.length;
  }
}

export function layoutGridDimensions(layout: LayoutDefinition): [number, number] | null {
  const geometry = layout.geometry;
  if (geometry.shape === "matrix" || geometry.shape === "wall") {
    return [geometry.rows, geometry.columns];
  }
  if (geometry.shape === "strip") {
    return geometry.orientation === "horizontal" ? [1, geometry.count] : [geometry.count, 1];
  }
  return null;
}

export function diagnoseLayoutDefinition(
  layout: LayoutDefinition,
  fixtureIds: number[],
): LayoutDiagnostic[] {
  const diagnostics: LayoutDiagnostic[] = [];
  if (!layout.name.trim()) {
    diagnostics.push({
      code: "LAYOUT_NAME_EMPTY",
      path: "layout.name",
      message: "Layout name is required.",
      recovery: "Enter a stable library name before saving the Layout.",
    });
  }
  const capacity = layoutCapacity(layout);
  if (capacity < fixtureIds.length) {
    diagnostics.push({
      code: "LAYOUT_CAPACITY_TOO_SMALL",
      path: "layout.geometry",
      message: `${layout.geometry.shape} provides ${capacity} positions for ${fixtureIds.length} patched fixtures.`,
      recovery:
        "Increase the row, column, ring, sample, or fixture count before previewing it on this Stage.",
    });
  }
  const geometryError = geometryDiagnostic(layout.geometry);
  if (geometryError) diagnostics.push(geometryError);
  if (layout.geometry.shape === "custom") {
    const ids = new Set(layout.geometry.fixtures.map((fixture) => fixture.id));
    const missing = fixtureIds.filter((id) => !ids.has(id));
    if (missing.length > 0) {
      diagnostics.push({
        code: "LAYOUT_CUSTOM_FIXTURES_MISSING",
        path: "layout.geometry.fixtures",
        message: `Custom coordinates are missing fixture IDs ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}.`,
        recovery: "Add coordinates for every patched fixture ID or choose a generated Layout.",
      });
    }
  }
  return diagnostics;
}

export function layoutPositions(
  layout: LayoutDefinition,
  fixtureIds: number[],
): CustomFixturePos[] {
  const geometry = layout.geometry;
  switch (geometry.shape) {
    case "matrix":
    case "wall":
      return gridPositions(geometry, fixtureIds);
    case "circle":
      return circlePositions(geometry, fixtureIds);
    case "strip":
      return fixtureIds.slice(0, geometry.count).map((id, index) => ({
        id,
        x:
          geometry.origin.x +
          (geometry.orientation === "horizontal" ? index * geometry.pitch.x : 0),
        y: geometry.origin.y + (geometry.orientation === "vertical" ? index * geometry.pitch.y : 0),
      }));
    case "frame":
      return framePositions(geometry, fixtureIds);
    case "custom":
      return structuredClone(geometry.fixtures);
    case "algorithm":
      return algorithmPositions(geometry, fixtureIds);
    case "formula":
    case "svg_path":
      return [];
  }
}

export function previewBundleForLayout(
  bundle: ProjectBundle,
  layout: LayoutDefinition,
): ProjectBundle {
  const preview = structuredClone(bundle);
  const reference = { id: layout.id, revision: layout.revision };
  const index = preview.layouts.findIndex(
    (candidate) => assetKey(candidate) === assetKey(reference),
  );
  if (index >= 0) preview.layouts[index] = structuredClone(layout);
  else preview.layouts.push(structuredClone(layout));
  if (
    !preview.manifest.layout_refs.some((candidate) => assetKey(candidate) === assetKey(reference))
  ) {
    preview.manifest.layout_refs.push(reference);
  }
  const stage = preview.stages.find(
    (candidate) => assetKey(candidate) === assetKey(preview.manifest.stage_ref),
  );
  if (stage) stage.layout_ref = reference;
  return preview;
}

function geometryDiagnostic(geometry: LayoutGeometry): LayoutDiagnostic | null {
  const invalidFixtureSize =
    !Number.isFinite(geometry.fixture_size.width) ||
    !Number.isFinite(geometry.fixture_size.height) ||
    geometry.fixture_size.width <= 0 ||
    geometry.fixture_size.height <= 0;
  if (invalidFixtureSize) {
    return diagnostic(
      "LAYOUT_FIXTURE_SIZE_INVALID",
      "layout.geometry.fixture_size",
      "Fixture width and height must be finite values greater than zero.",
      "Enter the physical Canvas footprint independently from the gap.",
    );
  }
  if (
    geometry.shape === "matrix" ||
    geometry.shape === "strip" ||
    geometry.shape === "wall" ||
    geometry.shape === "frame"
  ) {
    const values = [
      geometry.gap.x,
      geometry.gap.y,
      geometry.pitch.x,
      geometry.pitch.y,
      geometry.origin.x,
      geometry.origin.y,
    ];
    if (
      values.some((value) => !Number.isFinite(value)) ||
      geometry.gap.x < 0 ||
      geometry.gap.y < 0 ||
      geometry.pitch.x <= 0 ||
      geometry.pitch.y <= 0
    ) {
      return diagnostic(
        "LAYOUT_METRICS_INVALID",
        "layout.geometry",
        "Gap may be zero; pitch must be positive and all layout metrics must be finite.",
        "Set gap to zero for contiguous fixtures, or enter positive pitch values.",
      );
    }
    if (
      Math.abs(geometry.pitch.x - geometry.fixture_size.width - geometry.gap.x) > METRIC_EPSILON ||
      Math.abs(geometry.pitch.y - geometry.fixture_size.height - geometry.gap.y) > METRIC_EPSILON
    ) {
      return diagnostic(
        "LAYOUT_PITCH_MISMATCH",
        "layout.geometry.pitch",
        "Pitch must equal fixture size plus edge gap on each axis.",
        "Edit size or gap; Setup will keep pitch synchronized without collapsing the fields.",
      );
    }
  }
  if (geometry.shape === "circle") {
    const diameter = Math.max(geometry.fixture_size.width, geometry.fixture_size.height);
    if (
      !Number.isFinite(geometry.ring_gap) ||
      !Number.isFinite(geometry.ring_pitch) ||
      geometry.ring_gap < 0 ||
      geometry.ring_pitch <= 0 ||
      Math.abs(geometry.ring_pitch - diameter - geometry.ring_gap) > METRIC_EPSILON
    ) {
      return diagnostic(
        "LAYOUT_RING_METRICS_INVALID",
        "layout.geometry.ring_pitch",
        "Ring pitch must equal fixture diameter plus a non-negative ring gap.",
        "Adjust fixture size or ring gap; zero ring gap is supported.",
      );
    }
  }
  if (geometry.shape === "formula") {
    if (
      !geometry.formula.x.trim() ||
      !geometry.formula.y.trim() ||
      !Number.isFinite(geometry.formula.t_range[0]) ||
      !Number.isFinite(geometry.formula.t_range[1]) ||
      geometry.formula.t_range[1] <= geometry.formula.t_range[0] ||
      (geometry.formula.scale !== null &&
        geometry.formula.scale !== undefined &&
        (!Number.isFinite(geometry.formula.scale) || geometry.formula.scale <= 0))
    ) {
      return diagnostic(
        "LAYOUT_FORMULA_INVALID",
        "layout.geometry.formula",
        "Formula X/Y, an increasing t range, and a positive scale are required.",
        "Repair the formula parameters; backend preview will report expression diagnostics inline.",
      );
    }
  }
  if (geometry.shape === "svg_path" && !geometry.svg_path.d.trim()) {
    return diagnostic(
      "LAYOUT_SVG_PATH_EMPTY",
      "layout.geometry.svg_path.d",
      "SVG path data is empty.",
      "Restore the saved SVG path or duplicate an editable Layout.",
    );
  }
  return null;
}

function diagnostic(code: string, path: string, message: string, recovery: string) {
  return { code, path, message, recovery };
}

function gridPositions(
  geometry: Extract<LayoutGeometry, { shape: "matrix" | "wall" }>,
  fixtureIds: number[],
) {
  return fixtureIds.slice(0, geometry.rows * geometry.columns).map((id, index) => ({
    id,
    x: geometry.origin.x + (index % geometry.columns) * geometry.pitch.x,
    y: geometry.origin.y + Math.floor(index / geometry.columns) * geometry.pitch.y,
  }));
}

function circlePositions(
  geometry: Extract<LayoutGeometry, { shape: "circle" }>,
  fixtureIds: number[],
) {
  const positions = fixtureIds.length
    ? [{ id: fixtureIds[0], x: geometry.center.x, y: geometry.center.y }]
    : [];
  let index = 1;
  for (let ring = 1; ring <= geometry.rings && index < fixtureIds.length; ring += 1) {
    const count = geometry.increment * ring;
    for (let step = 0; step < count && index < fixtureIds.length; step += 1) {
      const angle = (step / count) * Math.PI * 2;
      positions.push({
        id: fixtureIds[index],
        x: geometry.center.x + Math.cos(angle) * geometry.ring_pitch * ring,
        y: geometry.center.y + Math.sin(angle) * geometry.ring_pitch * ring,
      });
      index += 1;
    }
  }
  return positions;
}

function framePositions(
  geometry: Extract<LayoutGeometry, { shape: "frame" }>,
  fixtureIds: number[],
) {
  const cells: Array<[number, number]> = [];
  for (let column = 0; column < geometry.columns; column += 1) cells.push([0, column]);
  for (let row = 1; row < geometry.rows; row += 1) cells.push([row, geometry.columns - 1]);
  if (geometry.rows > 1) {
    for (let column = geometry.columns - 2; column >= 0; column -= 1) {
      cells.push([geometry.rows - 1, column]);
    }
  }
  if (geometry.columns > 1) {
    for (let row = geometry.rows - 2; row >= 1; row -= 1) cells.push([row, 0]);
  }
  return fixtureIds.slice(0, cells.length).map((id, index) => ({
    id,
    x: geometry.origin.x + cells[index][1] * geometry.pitch.x,
    y: geometry.origin.y + cells[index][0] * geometry.pitch.y,
  }));
}

function algorithmPositions(
  geometry: Extract<LayoutGeometry, { shape: "algorithm" }>,
  fixtureIds: number[],
) {
  const divisor = Math.max(1, Math.min(geometry.count, fixtureIds.length) - 1);
  return fixtureIds.slice(0, geometry.count).map((id, index) => {
    const progress = index / divisor;
    if (geometry.algorithm === "spiral") {
      const turns = geometry.parameters.turns ?? 3;
      const radius = (geometry.parameters.radius ?? 180) * progress;
      const angle = progress * turns * Math.PI * 2;
      return {
        id,
        x: geometry.origin.x + Math.cos(angle) * radius,
        y: geometry.origin.y + Math.sin(angle) * radius,
      };
    }
    const angle = progress * Math.PI * 2;
    return {
      id,
      x:
        geometry.origin.x +
        Math.sin(
          (geometry.parameters.a ?? 3) * angle + (geometry.parameters.delta ?? Math.PI / 2),
        ) *
          (geometry.parameters.scale_x ?? 160),
      y:
        geometry.origin.y +
        Math.sin((geometry.parameters.b ?? 2) * angle) * (geometry.parameters.scale_y ?? 120),
    };
  });
}
