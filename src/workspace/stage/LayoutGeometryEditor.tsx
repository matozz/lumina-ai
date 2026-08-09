import { useEffect, useId, useState } from "react";
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
import { circleRingDensity, fixtureIdsForLayout } from "@/document/layoutDefinition";

export function LayoutGeometryEditor({
  layout,
  advanced = false,
  onChange,
}: {
  layout: LayoutDefinition;
  advanced?: boolean;
  onChange: (layout: LayoutDefinition) => void;
}) {
  const fixtureIds = fixtureIdsForLayout(layout);
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
      <FixtureSizeFields
        layout={layout}
        fixtureIds={fixtureIds}
        advanced={advanced}
        onChange={onChange}
      />
      {(geometry.shape === "matrix" ||
        geometry.shape === "wall" ||
        geometry.shape === "frame" ||
        geometry.shape === "honeycomb") && (
        <GridGeometryFields geometry={geometry} onChange={updateGeometry} />
      )}
      {geometry.shape === "strip" && (
        <StripGeometryFields geometry={geometry} onChange={updateGeometry} />
      )}
      {geometry.shape === "circle" && (
        <CircleGeometryFields geometry={geometry} onChange={updateGeometry} />
      )}
      {geometry.shape === "sector" && (
        <SectorGeometryFields geometry={geometry} onChange={updateGeometry} />
      )}
      {geometry.shape === "polygon" && (
        <PolygonGeometryFields geometry={geometry} onChange={updateGeometry} />
      )}
      {geometry.shape === "formula" && (
        <FormulaGeometryFields geometry={geometry} onChange={updateGeometry} />
      )}
      {geometry.shape === "algorithm" && (
        <AlgorithmGeometryFields layout={layout} onChange={updateGeometry} />
      )}
      {geometry.shape === "custom" && (
        <Alert>
          <LockKeyhole aria-hidden="true" />
          <AlertTitle>Custom / Freeform is not available in V1</AlertTitle>
          <AlertDescription>
            Saved coordinates remain readable, but freeform drag editing is intentionally not open
            in this release.
          </AlertDescription>
        </Alert>
      )}
      {geometry.shape === "svg_path" && (
        <Alert>
          <Braces aria-hidden="true" />
          <AlertTitle>SVG path source</AlertTitle>
          <AlertDescription>
            This layout preserves {geometry.svg_path.sample_count} sampled positions. Duplicate it
            before changing the source in Advanced.
          </AlertDescription>
        </Alert>
      )}
    </FieldGroup>
  );
}

type GridGeometry = Extract<LayoutGeometry, { shape: "matrix" | "wall" | "frame" | "honeycomb" }>;

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
      <GapFields geometry={geometry} onChange={onChange} />
      <FieldDescription>
        {geometry.shape === "frame"
          ? "Rows and columns describe the outer frame; fixtures follow its perimeter clockwise."
          : geometry.shape === "honeycomb"
            ? "Rows × columns define capacity; alternating rows are offset by half the unchanged horizontal pitch."
            : "Rows × columns define the rectangular capacity. Gap is the clear edge distance between fixture blocks and may be zero."}
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
      <GapFields geometry={geometry} onChange={onChange} />
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
  const density = circleRingDensity(geometry.increment);
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
          label="Fixtures per ring step"
          shortLabel="Ring density"
          value={density}
          min={1}
          integer
          onChange={(increment) =>
            onChange({ ...geometry, increment: circleRingDensity(increment) })
          }
        />
      </div>
      <NumberField
        label="Fixture gap"
        value={geometry.ring_gap}
        min={0}
        integer
        onChange={(ring_gap) =>
          onChange({
            ...geometry,
            increment: density,
            ring_gap,
            ring_pitch: diameter + ring_gap,
          })
        }
      />
      <FieldDescription>
        Rings change how many fixtures the Layout creates, never the spacing. Fixture gap stays
        edge-to-edge on every ring; ring density controls how many fixtures each new ring adds.
      </FieldDescription>
    </>
  );
}

function SectorGeometryFields({
  geometry,
  onChange,
}: {
  geometry: Extract<LayoutGeometry, { shape: "sector" }>;
  onChange: (geometry: Extract<LayoutGeometry, { shape: "sector" }>) => void;
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
          label="Segments per ring step"
          shortLabel="Segments"
          value={geometry.segments}
          min={1}
          integer
          onChange={(segments) => onChange({ ...geometry, segments })}
        />
        <NumberField
          label="Start angle"
          value={geometry.start_angle_degrees}
          onChange={(start_angle_degrees) => onChange({ ...geometry, start_angle_degrees })}
        />
        <NumberField
          label="Sweep angle"
          value={geometry.sweep_angle_degrees}
          min={0.1}
          max={360}
          onChange={(sweep_angle_degrees) => onChange({ ...geometry, sweep_angle_degrees })}
        />
      </div>
      <NumberField
        label="Fixture gap"
        value={geometry.ring_gap}
        min={0}
        onChange={(ring_gap) =>
          onChange({ ...geometry, ring_gap, ring_pitch: diameter + ring_gap })
        }
      />
      <FieldDescription>
        Rings and segments control quantity only. Fixture gap and radial pitch stay independent.
      </FieldDescription>
    </>
  );
}

function PolygonGeometryFields({
  geometry,
  onChange,
}: {
  geometry: Extract<LayoutGeometry, { shape: "polygon" }>;
  onChange: (geometry: Extract<LayoutGeometry, { shape: "polygon" }>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Sides"
          value={geometry.sides}
          min={3}
          integer
          onChange={(sides) => onChange({ ...geometry, sides })}
        />
        <NumberField
          label="Fixtures per side"
          value={geometry.fixtures_per_side}
          min={1}
          integer
          onChange={(fixtures_per_side) => onChange({ ...geometry, fixtures_per_side })}
        />
        <NumberField
          label="Radius"
          value={geometry.radius}
          min={0.1}
          onChange={(radius) => onChange({ ...geometry, radius })}
        />
        <NumberField
          label="Rotation"
          value={geometry.rotation_degrees}
          onChange={(rotation_degrees) => onChange({ ...geometry, rotation_degrees })}
        />
      </div>
      <FieldDescription>
        Side and fixture counts never rewrite the saved radius or rotation.
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
      <FieldDescription>
        The saved formula is evaluated with the same supported functions in the editor and engine;
        expression errors are returned here without changing the saved path.
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
    </>
  );
}

type GapGeometry = Extract<
  LayoutGeometry,
  { shape: "matrix" | "wall" | "frame" | "strip" | "honeycomb" }
>;

function GapFields<T extends GapGeometry>({
  geometry,
  onChange,
}: {
  geometry: T;
  onChange: (geometry: T) => void;
}) {
  const updateGap = (axis: "x" | "y", value: number) => {
    const gap = { ...geometry.gap, [axis]: value };
    const pitch = {
      x: geometry.fixture_size.width + gap.x,
      y: geometry.fixture_size.height + gap.y,
    };
    onChange({ ...geometry, gap, pitch });
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField
        label="Gap X"
        value={geometry.gap.x}
        min={0}
        integer
        onChange={(value) => updateGap("x", value)}
      />
      <NumberField
        label="Gap Y"
        value={geometry.gap.y}
        min={0}
        integer
        onChange={(value) => updateGap("y", value)}
      />
    </div>
  );
}

type OriginGeometry = Extract<
  LayoutGeometry,
  { shape: "matrix" | "wall" | "frame" | "strip" | "honeycomb" | "algorithm" }
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
        integer
        onChange={(x) => onChange({ ...geometry, origin: { ...geometry.origin, x } })}
      />
      <NumberField
        label="Origin Y"
        value={geometry.origin.y}
        integer
        onChange={(y) => onChange({ ...geometry, origin: { ...geometry.origin, y } })}
      />
    </div>
  );
}

function FixtureSizeFields({
  layout,
  fixtureIds,
  advanced,
  onChange,
}: {
  layout: LayoutDefinition;
  fixtureIds: number[];
  advanced: boolean;
  onChange: (layout: LayoutDefinition) => void;
}) {
  const geometry = layout.geometry;
  const fixtureSizeOverrides = layout.fixture_size_overrides ?? [];
  const [selectedFixtureId, setSelectedFixtureId] = useState(fixtureIds[0] ?? 0);
  useEffect(() => {
    if (!fixtureIds.includes(selectedFixtureId)) setSelectedFixtureId(fixtureIds[0] ?? 0);
  }, [fixtureIds, selectedFixtureId]);

  const update = (axis: "width" | "height", value: number) => {
    const fixture_size = { ...geometry.fixture_size, [axis]: value };
    if (
      geometry.shape === "matrix" ||
      geometry.shape === "wall" ||
      geometry.shape === "frame" ||
      geometry.shape === "strip" ||
      geometry.shape === "honeycomb"
    ) {
      onChange({
        ...layout,
        geometry: {
          ...geometry,
          fixture_size,
          pitch: {
            x: fixture_size.width + geometry.gap.x,
            y: fixture_size.height + geometry.gap.y,
          },
        },
        fixture_size_overrides: undefined,
      });
      return;
    }
    if (geometry.shape === "circle" || geometry.shape === "sector") {
      onChange({
        ...layout,
        geometry: {
          ...geometry,
          fixture_size,
          ring_pitch: Math.max(fixture_size.width, fixture_size.height) + geometry.ring_gap,
        },
        fixture_size_overrides: undefined,
      });
      return;
    }
    onChange({
      ...layout,
      geometry: { ...geometry, fixture_size } as LayoutGeometry,
      fixture_size_overrides: undefined,
    });
  };
  const override = fixtureSizeOverrides.find((item) => item.fixture_id === selectedFixtureId);
  const selectedSize = override?.size ?? geometry.fixture_size;
  const selectedFixtureExists = fixtureIds.includes(selectedFixtureId);
  const updateFixture = (axis: "width" | "height", value: number) => {
    if (!selectedFixtureExists) return;
    const next = fixtureSizeOverrides.filter((item) => item.fixture_id !== selectedFixtureId);
    next.push({
      fixture_id: selectedFixtureId,
      size: { ...selectedSize, [axis]: value },
    });
    next.sort((left, right) => left.fixture_id - right.fixture_id);
    onChange({ ...layout, fixture_size_overrides: next });
  };
  return (
    <>
      <FieldDescription>
        Fixture size applies to every block and is rendered at the same Canvas aspect ratio. Editing
        either value applies it to all fixtures and clears individual overrides.
      </FieldDescription>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Fixture width"
          value={geometry.fixture_size.width}
          min={1}
          integer
          onChange={(width) => update("width", width)}
        />
        <NumberField
          label="Fixture height"
          value={geometry.fixture_size.height}
          min={1}
          integer
          onChange={(height) => update("height", height)}
        />
      </div>
      {advanced && (
        <div className="border-border bg-background/30 flex flex-col gap-2 rounded-md border p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium">Individual fixture size</p>
            <span className="text-muted-foreground font-mono text-[9px]">
              {fixtureSizeOverrides.length} overrides
            </span>
          </div>
          <NumberField
            label="Fixture ID for size override"
            shortLabel="Fixture ID"
            value={selectedFixtureId}
            min={fixtureIds[0] ?? 0}
            integer
            onChange={setSelectedFixtureId}
          />
          {selectedFixtureExists ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label={`Fixture ${selectedFixtureId} width`}
                  shortLabel="Width"
                  value={selectedSize.width}
                  min={1}
                  integer
                  onChange={(width) => updateFixture("width", width)}
                />
                <NumberField
                  label={`Fixture ${selectedFixtureId} height`}
                  shortLabel="Height"
                  value={selectedSize.height}
                  min={1}
                  integer
                  onChange={(height) => updateFixture("height", height)}
                />
              </div>
              <Button
                size="xs"
                variant="outline"
                disabled={!override}
                onClick={() => {
                  const remaining = fixtureSizeOverrides.filter(
                    (item) => item.fixture_id !== selectedFixtureId,
                  );
                  onChange({
                    ...layout,
                    fixture_size_overrides: remaining.length > 0 ? remaining : undefined,
                  });
                }}
              >
                Clear fixture override
              </Button>
            </>
          ) : (
            <FieldDescription>
              Enter a patched fixture ID to edit its size without changing the other blocks.
            </FieldDescription>
          )}
        </div>
      )}
    </>
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
        className="h-6 font-mono text-xs tabular-nums"
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
        className="h-6 font-mono text-xs"
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
