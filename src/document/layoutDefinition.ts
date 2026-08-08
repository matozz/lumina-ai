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
  severity: "error" | "warning";
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

export function fixtureIdsForLayout(layout: LayoutDefinition, startId = 1) {
  if (layout.geometry.shape === "custom") {
    return layout.geometry.fixtures.map((fixture) => fixture.id);
  }
  return Array.from({ length: layoutCapacity(layout) }, (_, index) => startId + index);
}

export function layoutCapacity(layout: LayoutDefinition) {
  const geometry = layout.geometry;
  switch (geometry.shape) {
    case "matrix":
    case "wall":
      return geometry.rows * geometry.columns;
    case "circle":
      return 1 + (geometry.increment * geometry.rings * (geometry.rings + 1)) / 2;
    case "sector":
      return (geometry.segments * geometry.rings * (geometry.rings + 1)) / 2;
    case "polygon":
      return geometry.sides * geometry.fixtures_per_side;
    case "honeycomb":
      return geometry.rows * geometry.columns;
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
  if (geometry.shape === "matrix" || geometry.shape === "wall" || geometry.shape === "honeycomb") {
    return [geometry.rows, geometry.columns];
  }
  if (geometry.shape === "strip") {
    return geometry.orientation === "horizontal" ? [1, geometry.count] : [geometry.count, 1];
  }
  return null;
}

export function diagnoseLayoutDefinition(layout: LayoutDefinition): LayoutDiagnostic[] {
  const diagnostics: LayoutDiagnostic[] = [];
  if (!layout.name.trim()) {
    diagnostics.push({
      code: "LAYOUT_NAME_EMPTY",
      severity: "error",
      path: "layout.name",
      message: "Layout name is required.",
      recovery: "Enter a stable library name before saving the Layout.",
    });
  }
  const geometryError = geometryDiagnostic(layout.geometry);
  if (geometryError) diagnostics.push(geometryError);
  if (layout.geometry.shape === "custom") {
    const ids = layout.geometry.fixtures.map((fixture) => fixture.id);
    if (new Set(ids).size !== ids.length) {
      diagnostics.push({
        code: "LAYOUT_CUSTOM_FIXTURES_DUPLICATED",
        severity: "error",
        path: "layout.geometry.fixtures",
        message: "Custom coordinates contain duplicate fixture IDs.",
        recovery: "Give every custom position a unique fixture ID before saving the Layout.",
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
    case "sector":
      return sectorPositions(geometry, fixtureIds);
    case "polygon":
      return polygonPositions(geometry, fixtureIds);
    case "honeycomb":
      return honeycombPositions(geometry, fixtureIds);
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
      return formulaPositions(geometry, fixtureIds);
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
    geometry.shape === "frame" ||
    geometry.shape === "honeycomb"
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
        "Circle spacing must equal fixture diameter plus a non-negative fixture gap.",
        "Adjust fixture size or fixture gap; zero gap is supported.",
      );
    }
  }
  if (geometry.shape === "sector") {
    const radialError = radialMetricDiagnostic(
      geometry.fixture_size,
      geometry.ring_gap,
      geometry.ring_pitch,
    );
    if (radialError) return radialError;
    if (
      geometry.rings < 1 ||
      geometry.segments < 1 ||
      !Number.isFinite(geometry.start_angle_degrees) ||
      !Number.isFinite(geometry.sweep_angle_degrees) ||
      geometry.sweep_angle_degrees <= 0 ||
      geometry.sweep_angle_degrees > 360 ||
      !Number.isFinite(geometry.center.x) ||
      !Number.isFinite(geometry.center.y)
    ) {
      return diagnostic(
        "LAYOUT_SECTOR_INVALID",
        "layout.geometry",
        "Sector counts, center, and angles must be finite; sweep must be in (0, 360].",
        "Use positive rings and segments with a valid angular sweep.",
      );
    }
  }
  if (geometry.shape === "polygon") {
    if (
      geometry.sides < 3 ||
      geometry.fixtures_per_side < 1 ||
      !Number.isFinite(geometry.radius) ||
      geometry.radius <= 0 ||
      !Number.isFinite(geometry.rotation_degrees) ||
      !Number.isFinite(geometry.center.x) ||
      !Number.isFinite(geometry.center.y)
    ) {
      return diagnostic(
        "LAYOUT_POLYGON_INVALID",
        "layout.geometry",
        "Polygon sides, fixture count, radius, rotation, and center must be valid.",
        "Use at least three sides, one fixture per side, and a positive radius.",
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
  return { code, severity: "error" as const, path, message, recovery };
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
  const ringCounts = circleRingFixtureCounts(fixtureIds.length, geometry.rings, geometry.increment);
  for (let ring = 1; ring <= ringCounts.length && index < fixtureIds.length; ring += 1) {
    const count = ringCounts[ring - 1];
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

export function circleRingFixtureCounts(fixtureCount: number, rings: number, increment: number) {
  const ringCount = Math.max(0, Math.floor(rings));
  if (ringCount === 0 || fixtureCount <= 1) return Array.from({ length: ringCount }, () => 0);

  const ringWeight = (ringCount * (ringCount + 1)) / 2;
  const capacity = Math.max(0, Math.floor(increment)) * ringWeight;
  const remaining = Math.min(Math.max(0, Math.floor(fixtureCount) - 1), capacity);
  const allocations = Array.from({ length: ringCount }, (_, index) => {
    const weighted = remaining * (index + 1);
    return {
      index,
      count: Math.floor(weighted / ringWeight),
      remainder: weighted % ringWeight,
    };
  });
  let unassigned = remaining - allocations.reduce((sum, allocation) => sum + allocation.count, 0);
  const priority = [...allocations].sort(
    (left, right) => right.remainder - left.remainder || right.index - left.index,
  );
  for (let index = 0; index < unassigned; index += 1) {
    priority[index % priority.length].count += 1;
  }
  return allocations.map((allocation) => allocation.count);
}

export function circleRingDensity(increment: number) {
  return Math.max(1, Math.floor(increment));
}

function sectorPositions(
  geometry: Extract<LayoutGeometry, { shape: "sector" }>,
  fixtureIds: number[],
) {
  const positions: CustomFixturePos[] = [];
  let index = 0;
  const fullCircle = Math.abs(geometry.sweep_angle_degrees - 360) <= METRIC_EPSILON;
  for (let ring = 1; ring <= geometry.rings; ring += 1) {
    const count = geometry.segments * ring;
    const divisor = fullCircle ? count : Math.max(1, count - 1);
    for (let step = 0; step < count && index < fixtureIds.length; step += 1) {
      const angle =
        ((geometry.start_angle_degrees + (geometry.sweep_angle_degrees * step) / divisor) *
          Math.PI) /
        180;
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

function polygonPositions(
  geometry: Extract<LayoutGeometry, { shape: "polygon" }>,
  fixtureIds: number[],
) {
  const capacity = geometry.sides * geometry.fixtures_per_side;
  const rotation = (geometry.rotation_degrees * Math.PI) / 180;
  return fixtureIds.slice(0, capacity).map((id, index) => {
    const side = Math.floor(index / geometry.fixtures_per_side);
    const step = index % geometry.fixtures_per_side;
    const startAngle = rotation + (Math.PI * 2 * side) / geometry.sides;
    const endAngle = rotation + (Math.PI * 2 * (side + 1)) / geometry.sides;
    const progress = step / geometry.fixtures_per_side;
    const start = [Math.cos(startAngle) * geometry.radius, Math.sin(startAngle) * geometry.radius];
    const end = [Math.cos(endAngle) * geometry.radius, Math.sin(endAngle) * geometry.radius];
    return {
      id,
      x: geometry.center.x + start[0] + (end[0] - start[0]) * progress,
      y: geometry.center.y + start[1] + (end[1] - start[1]) * progress,
    };
  });
}

function honeycombPositions(
  geometry: Extract<LayoutGeometry, { shape: "honeycomb" }>,
  fixtureIds: number[],
) {
  return fixtureIds.slice(0, geometry.rows * geometry.columns).map((id, index) => {
    const row = Math.floor(index / geometry.columns);
    const column = index % geometry.columns;
    return {
      id,
      x: geometry.origin.x + column * geometry.pitch.x + (row % 2) * (geometry.pitch.x / 2),
      y: geometry.origin.y + row * geometry.pitch.y,
    };
  });
}

function formulaPositions(
  geometry: Extract<LayoutGeometry, { shape: "formula" }>,
  fixtureIds: number[],
) {
  const ids = fixtureIds.slice(0, geometry.formula.count);
  const divisor = Math.max(1, ids.length - 1);
  const scale = geometry.formula.scale ?? 1;
  return ids.map((id, index) => {
    const progress = index / divisor;
    const t =
      geometry.formula.t_range[0] +
      (geometry.formula.t_range[1] - geometry.formula.t_range[0]) * progress;
    return {
      id,
      x: evaluateFormula(geometry.formula.x, t) * scale,
      y: evaluateFormula(geometry.formula.y, t) * scale,
    };
  });
}

function radialMetricDiagnostic(
  fixtureSize: { width: number; height: number },
  ringGap: number,
  ringPitch: number,
) {
  const diameter = Math.max(fixtureSize.width, fixtureSize.height);
  if (
    !Number.isFinite(ringGap) ||
    !Number.isFinite(ringPitch) ||
    ringGap < 0 ||
    ringPitch <= 0 ||
    Math.abs(ringPitch - diameter - ringGap) > METRIC_EPSILON
  ) {
    return diagnostic(
      "LAYOUT_RADIAL_METRICS_INVALID",
      "layout.geometry.ring_pitch",
      "Radial spacing must equal fixture diameter plus a non-negative fixture gap.",
      "Adjust fixture size or fixture gap; quantity fields never rewrite this spacing.",
    );
  }
  return null;
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

export function evaluateFormula(source: string, t: number) {
  const tokens: string[] = [];
  const tokenizer =
    /\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?|([A-Za-z_][A-Za-z0-9_]*)|([()+\-*/^,]))/y;
  let cursor = 0;
  while (cursor < source.length) {
    tokenizer.lastIndex = cursor;
    const match = tokenizer.exec(source);
    if (!match) throw new Error(`Unsupported formula token at ${cursor}`);
    tokens.push(match[0].trim());
    cursor = tokenizer.lastIndex;
  }
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const expect = (token: string) => {
    if (take() !== token) throw new Error(`Expected ${token}`);
  };
  const expression = (): number => {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      const operator = take();
      const right = product();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const product = (): number => {
    let value = power();
    while (peek() === "*" || peek() === "/") {
      const operator = take();
      const right = power();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  const power = (): number => {
    let value = unary();
    if (peek() === "^") {
      take();
      value = Math.pow(value, power());
    }
    return value;
  };
  const unary = (): number => {
    if (peek() === "+") {
      take();
      return unary();
    }
    if (peek() === "-") {
      take();
      return -unary();
    }
    return primary();
  };
  const primary = (): number => {
    const token = take();
    if (!token) throw new Error("Formula ended unexpectedly");
    const numeric = Number(token);
    if (!Number.isNaN(numeric)) return numeric;
    if (token === "(") {
      const value = expression();
      expect(")");
      return value;
    }
    if (token === "t") return t;
    if (token === "pi") return Math.PI;
    if (token === "e") return Math.E;
    if (peek() !== "(") throw new Error(`Unknown formula identifier: ${token}`);
    take();
    const args = [expression()];
    while (peek() === ",") {
      take();
      args.push(expression());
    }
    expect(")");
    const functions: Record<string, (...values: number[]) => number> = {
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      abs: Math.abs,
      sqrt: Math.sqrt,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      pow: Math.pow,
      min: Math.min,
      max: Math.max,
    };
    const fn = functions[token];
    if (!fn) throw new Error(`Unsupported formula function: ${token}`);
    return fn(...args);
  };
  const value = expression();
  if (index !== tokens.length) throw new Error(`Unexpected formula token: ${peek()}`);
  if (!Number.isFinite(value)) throw new Error("Formula produced a non-finite coordinate");
  return value;
}
