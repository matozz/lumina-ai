import { useId } from "react";
import { Braces, LockKeyhole } from "lucide-react";
import type { LayoutDefinition, LayoutGeometry } from "@/bridge/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fixtureIdsForStage } from "@/document/layoutDefinition";
import type { StageDocument } from "@/bridge/types";

export function LayoutGeometryEditor({
  layout,
  stage,
  onChange,
}: {
  layout: LayoutDefinition;
  stage: StageDocument;
  onChange: (layout: LayoutDefinition) => void;
}) {
  const fixtureIds = fixtureIdsForStage(stage);
  const updateGeometry = (geometry: LayoutGeometry) => onChange({ ...layout, geometry });

  if (layout.editor.mode === "read_only") {
    return (
      <Alert>
        <LockKeyhole aria-hidden="true" />
        <AlertTitle>Read-only Layout</AlertTitle>
        <AlertDescription>{layout.editor.reason}</AlertDescription>
      </Alert>
    );
  }

  const geometry = layout.geometry;
  return (
    <FieldGroup>
      {(geometry.shape === "matrix" || geometry.shape === "wall" || geometry.shape === "frame") && (
        <GridGeometryFields geometry={geometry} onChange={updateGeometry} />
      )}
      {geometry.shape === "strip" && (
        <StripGeometryFields geometry={geometry} onChange={updateGeometry} />
      )}
      {geometry.shape === "circle" && (
        <CircleGeometryFields geometry={geometry} onChange={updateGeometry} />
      )}
      {geometry.shape === "formula" && (
        <FormulaGeometryFields geometry={geometry} onChange={updateGeometry} />
      )}
      {geometry.shape === "algorithm" && (
        <AlgorithmGeometryFields layout={layout} onChange={updateGeometry} />
      )}
      {geometry.shape === "custom" && (
        <CustomGeometryFields
          geometry={geometry}
          fixtureIds={fixtureIds}
          onChange={updateGeometry}
        />
      )}
      {geometry.shape === "svg_path" && (
        <Alert>
          <Braces aria-hidden="true" />
          <AlertTitle>SVG path source</AlertTitle>
          <AlertDescription>
            This revision preserves {geometry.svg_path.sample_count} sampled positions. Duplicate it
            before changing source data in the advanced editor.
          </AlertDescription>
        </Alert>
      )}
    </FieldGroup>
  );
}

type GridGeometry = Extract<LayoutGeometry, { shape: "matrix" | "wall" | "frame" }>;

function GridGeometryFields({
  geometry,
  onChange,
}: {
  geometry: GridGeometry;
  onChange: (geometry: GridGeometry) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Rows"
          value={geometry.rows}
          min={1}
          integer
          onChange={(rows) => onChange({ ...geometry, rows })}
        />
        <NumberField
          label="Columns"
          value={geometry.columns}
          min={1}
          integer
          onChange={(columns) => onChange({ ...geometry, columns })}
        />
      </div>
      <MetricFields geometry={geometry} onChange={onChange} />
      <OriginFields geometry={geometry} onChange={onChange} />
      <FieldDescription>
        {geometry.shape === "frame"
          ? "Frame fixtures follow the perimeter clockwise; rows and columns describe its outer bounds."
          : "Rows × columns may use zero edge gap. Fixture size affects Canvas footprint; pitch controls center spacing."}
      </FieldDescription>
    </>
  );
}

function StripGeometryFields({
  geometry,
  onChange,
}: {
  geometry: Extract<LayoutGeometry, { shape: "strip" }>;
  onChange: (geometry: Extract<LayoutGeometry, { shape: "strip" }>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Fixtures"
          value={geometry.count}
          min={1}
          integer
          onChange={(count) => onChange({ ...geometry, count })}
        />
        <Field>
          <FieldLabel>Orientation</FieldLabel>
          <Select
            value={geometry.orientation}
            onValueChange={(orientation) =>
              orientation &&
              onChange({ ...geometry, orientation: orientation as "horizontal" | "vertical" })
            }
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Strip orientation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="horizontal">Horizontal bar</SelectItem>
                <SelectItem value="vertical">Vertical bar</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <MetricFields geometry={geometry} onChange={onChange} />
      <OriginFields geometry={geometry} onChange={onChange} />
    </>
  );
}

function CircleGeometryFields({
  geometry,
  onChange,
}: {
  geometry: Extract<LayoutGeometry, { shape: "circle" }>;
  onChange: (geometry: Extract<LayoutGeometry, { shape: "circle" }>) => void;
}) {
  const diameter = Math.max(geometry.fixture_size.width, geometry.fixture_size.height);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Rings"
          value={geometry.rings}
          min={1}
          integer
          onChange={(rings) => onChange({ ...geometry, rings })}
        />
        <NumberField
          label="Ring increment"
          value={geometry.increment}
          min={1}
          integer
          onChange={(increment) => onChange({ ...geometry, increment })}
        />
        <NumberField
          label="Fixture width"
          value={geometry.fixture_size.width}
          min={0.01}
          onChange={(width) => {
            const fixture_size = { ...geometry.fixture_size, width };
            const nextDiameter = Math.max(width, fixture_size.height);
            onChange({
              ...geometry,
              fixture_size,
              ring_pitch: nextDiameter + geometry.ring_gap,
            });
          }}
        />
        <NumberField
          label="Fixture height"
          value={geometry.fixture_size.height}
          min={0.01}
          onChange={(height) => {
            const fixture_size = { ...geometry.fixture_size, height };
            const nextDiameter = Math.max(fixture_size.width, height);
            onChange({
              ...geometry,
              fixture_size,
              ring_pitch: nextDiameter + geometry.ring_gap,
            });
          }}
        />
        <NumberField
          label="Ring gap"
          value={geometry.ring_gap}
          min={0}
          onChange={(ring_gap) =>
            onChange({ ...geometry, ring_gap, ring_pitch: diameter + ring_gap })
          }
        />
        <NumberField
          label="Ring pitch"
          value={geometry.ring_pitch}
          min={diameter}
          onChange={(requestedPitch) => {
            const ring_gap = Math.max(0, requestedPitch - diameter);
            onChange({ ...geometry, ring_gap, ring_pitch: diameter + ring_gap });
          }}
        />
        <NumberField
          label="Center X"
          value={geometry.center.x}
          onChange={(x) => onChange({ ...geometry, center: { ...geometry.center, x } })}
        />
        <NumberField
          label="Center Y"
          value={geometry.center.y}
          onChange={(y) => onChange({ ...geometry, center: { ...geometry.center, y } })}
        />
      </div>
      <FieldDescription>
        Zero ring gap is valid. Ring pitch remains explicit and synchronized to fixture diameter +
        gap.
      </FieldDescription>
    </>
  );
}

function FormulaGeometryFields({
  geometry,
  onChange,
}: {
  geometry: Extract<LayoutGeometry, { shape: "formula" }>;
  onChange: (geometry: Extract<LayoutGeometry, { shape: "formula" }>) => void;
}) {
  return (
    <>
      <TextField
        label="X formula"
        value={geometry.formula.x}
        onChange={(x) => onChange({ ...geometry, formula: { ...geometry.formula, x } })}
      />
      <TextField
        label="Y formula"
        value={geometry.formula.y}
        onChange={(y) => onChange({ ...geometry, formula: { ...geometry.formula, y } })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Fixtures"
          value={geometry.formula.count}
          min={1}
          integer
          onChange={(count) => onChange({ ...geometry, formula: { ...geometry.formula, count } })}
        />
        <NumberField
          label="Scale"
          value={geometry.formula.scale ?? 1}
          min={0.01}
          onChange={(scale) => onChange({ ...geometry, formula: { ...geometry.formula, scale } })}
        />
        <NumberField
          label="t start"
          value={geometry.formula.t_range[0]}
          onChange={(start) =>
            onChange({
              ...geometry,
              formula: { ...geometry.formula, t_range: [start, geometry.formula.t_range[1]] },
            })
          }
        />
        <NumberField
          label="t end"
          value={geometry.formula.t_range[1]}
          onChange={(end) =>
            onChange({
              ...geometry,
              formula: { ...geometry.formula, t_range: [geometry.formula.t_range[0], end] },
            })
          }
        />
      </div>
      <FixtureSizeFields geometry={geometry} onChange={onChange} />
      <FieldDescription>
        The saved Stage Setup formula path is preserved; Canvas preview is evaluated by the Rust
        compiler, with expression errors returned at this editor.
      </FieldDescription>
    </>
  );
}

function AlgorithmGeometryFields({
  layout,
  onChange,
}: {
  layout: LayoutDefinition;
  onChange: (geometry: Extract<LayoutGeometry, { shape: "algorithm" }>) => void;
}) {
  const geometry = layout.geometry as Extract<LayoutGeometry, { shape: "algorithm" }>;
  const parameters = layout.editor.mode === "parameter_schema" ? layout.editor.parameters : [];
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Fixtures"
          value={geometry.count}
          min={1}
          integer
          onChange={(count) => onChange({ ...geometry, count })}
        />
        <Field>
          <FieldLabel>Algorithm</FieldLabel>
          <Select
            value={geometry.algorithm}
            onValueChange={(algorithm) =>
              algorithm && onChange({ ...geometry, algorithm: algorithm as "lissajous" | "spiral" })
            }
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Layout algorithm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="lissajous">Lissajous</SelectItem>
                <SelectItem value="spiral">Spiral</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {parameters.map((parameter) => (
          <NumberField
            key={parameter.id}
            label={parameter.label}
            value={geometry.parameters[parameter.id] ?? 0}
            min={parameter.minimum ?? undefined}
            max={parameter.maximum ?? undefined}
            step={parameter.step ?? undefined}
            integer={parameter.value_type === "integer"}
            onChange={(value) =>
              onChange({
                ...geometry,
                parameters: { ...geometry.parameters, [parameter.id]: value },
              })
            }
          />
        ))}
      </div>
      <OriginFields geometry={geometry} onChange={onChange} />
      <FixtureSizeFields geometry={geometry} onChange={onChange} />
    </>
  );
}

function CustomGeometryFields({
  geometry,
  fixtureIds,
  onChange,
}: {
  geometry: Extract<LayoutGeometry, { shape: "custom" }>;
  fixtureIds: number[];
  onChange: (geometry: Extract<LayoutGeometry, { shape: "custom" }>) => void;
}) {
  const positions = new Map(geometry.fixtures.map((fixture) => [fixture.id, fixture]));
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, fixtureIds.length))));
  const reconciled = fixtureIds.map(
    (id, index) =>
      positions.get(id) ?? { id, x: (index % columns) * 64, y: Math.floor(index / columns) * 64 },
  );
  const updateFixture = (id: number, changes: Partial<{ x: number; y: number }>) =>
    onChange({
      ...geometry,
      fixtures: reconciled.map((fixture) =>
        fixture.id === id ? { ...fixture, ...changes } : fixture,
      ),
    });
  return (
    <>
      <div className="flex items-center justify-between">
        <FieldDescription>{reconciled.length} fixture coordinates</FieldDescription>
        <Button
          size="xs"
          variant="outline"
          onClick={() => onChange({ ...geometry, fixtures: reconciled })}
        >
          Reconcile IDs
        </Button>
      </div>
      <div className="border-border max-h-56 overflow-y-auto rounded-md border">
        {reconciled.map((fixture) => (
          <div
            key={fixture.id}
            className="border-border grid grid-cols-[2.75rem_1fr_1fr] items-end gap-1.5 border-b p-1.5 last:border-b-0"
          >
            <span className="text-muted-foreground pb-2 font-mono text-[9px]">#{fixture.id}</span>
            <NumberField
              label={`Fixture ${fixture.id} X`}
              shortLabel="X"
              value={fixture.x}
              onChange={(x) => updateFixture(fixture.id, { x })}
            />
            <NumberField
              label={`Fixture ${fixture.id} Y`}
              shortLabel="Y"
              value={fixture.y}
              onChange={(y) => updateFixture(fixture.id, { y })}
            />
          </div>
        ))}
      </div>
      <FixtureSizeFields geometry={geometry} onChange={onChange} />
    </>
  );
}

type MetricGeometry = Extract<LayoutGeometry, { shape: "matrix" | "wall" | "frame" | "strip" }>;

function MetricFields<T extends MetricGeometry>({
  geometry,
  onChange,
}: {
  geometry: T;
  onChange: (geometry: T) => void;
}) {
  const updateSize = (axis: "width" | "height", value: number) => {
    const fixture_size = { ...geometry.fixture_size, [axis]: value };
    const pitch = {
      x: fixture_size.width + geometry.gap.x,
      y: fixture_size.height + geometry.gap.y,
    };
    onChange({ ...geometry, fixture_size, pitch });
  };
  const updateGap = (axis: "x" | "y", value: number) => {
    const gap = { ...geometry.gap, [axis]: value };
    const pitch = {
      x: geometry.fixture_size.width + gap.x,
      y: geometry.fixture_size.height + gap.y,
    };
    onChange({ ...geometry, gap, pitch });
  };
  const updatePitch = (axis: "x" | "y", requested: number) => {
    const size = axis === "x" ? geometry.fixture_size.width : geometry.fixture_size.height;
    const gapValue = Math.max(0, requested - size);
    const gap = { ...geometry.gap, [axis]: gapValue };
    const pitch = { ...geometry.pitch, [axis]: size + gapValue };
    onChange({ ...geometry, gap, pitch });
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField
        label="Fixture width"
        value={geometry.fixture_size.width}
        min={0.01}
        onChange={(value) => updateSize("width", value)}
      />
      <NumberField
        label="Fixture height"
        value={geometry.fixture_size.height}
        min={0.01}
        onChange={(value) => updateSize("height", value)}
      />
      <NumberField
        label="Gap X"
        value={geometry.gap.x}
        min={0}
        onChange={(value) => updateGap("x", value)}
      />
      <NumberField
        label="Gap Y"
        value={geometry.gap.y}
        min={0}
        onChange={(value) => updateGap("y", value)}
      />
      <NumberField
        label="Pitch X"
        value={geometry.pitch.x}
        min={geometry.fixture_size.width}
        onChange={(value) => updatePitch("x", value)}
      />
      <NumberField
        label="Pitch Y"
        value={geometry.pitch.y}
        min={geometry.fixture_size.height}
        onChange={(value) => updatePitch("y", value)}
      />
    </div>
  );
}

type OriginGeometry = Extract<
  LayoutGeometry,
  { shape: "matrix" | "wall" | "frame" | "strip" | "algorithm" }
>;

function OriginFields<T extends OriginGeometry>({
  geometry,
  onChange,
}: {
  geometry: T;
  onChange: (geometry: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField
        label="Origin X"
        value={geometry.origin.x}
        onChange={(x) => onChange({ ...geometry, origin: { ...geometry.origin, x } })}
      />
      <NumberField
        label="Origin Y"
        value={geometry.origin.y}
        onChange={(y) => onChange({ ...geometry, origin: { ...geometry.origin, y } })}
      />
    </div>
  );
}

type FixtureSizeGeometry = Extract<
  LayoutGeometry,
  { shape: "formula" | "svg_path" | "custom" | "algorithm" }
>;

function FixtureSizeFields<T extends FixtureSizeGeometry>({
  geometry,
  onChange,
}: {
  geometry: T;
  onChange: (geometry: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField
        label="Fixture width"
        value={geometry.fixture_size.width}
        min={0.01}
        onChange={(width) =>
          onChange({ ...geometry, fixture_size: { ...geometry.fixture_size, width } })
        }
      />
      <NumberField
        label="Fixture height"
        value={geometry.fixture_size.height}
        min={0.01}
        onChange={(height) =>
          onChange({ ...geometry, fixture_size: { ...geometry.fixture_size, height } })
        }
      />
    </div>
  );
}

function NumberField({
  label,
  shortLabel,
  value,
  min,
  max,
  step,
  integer,
  onChange,
}: {
  label: string;
  shortLabel?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{shortLabel ?? label}</FieldLabel>
      <Input
        id={id}
        aria-label={label}
        type="number"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={integer ? 1 : (step ?? 0.1)}
        className="h-7 font-mono text-xs tabular-nums"
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(integer ? Math.round(next) : next);
        }}
      />
    </Field>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        className="h-7 font-mono text-xs"
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
