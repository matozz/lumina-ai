import { useMemo } from "react";
import { Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EditableLayoutShape, StageLayoutParameters } from "./stageSetup";
import { buildLayout, layoutPositions } from "./stageSetup";

export function StageLayoutEditor({
  shape,
  fixtureIds,
  parameters,
  onChange,
}: {
  shape: EditableLayoutShape;
  fixtureIds: number[];
  parameters: StageLayoutParameters;
  onChange: (parameters: StageLayoutParameters) => void;
}) {
  const update = (changes: Partial<StageLayoutParameters>) =>
    onChange({ ...parameters, ...changes });

  return (
    <div className="flex flex-col gap-2 rounded-md bg-zinc-950/40 p-2">
      <LayoutMiniMap shape={shape} fixtureIds={fixtureIds} parameters={parameters} />

      {shape === "matrix" && (
        <div className="grid grid-cols-2 gap-2">
          <NumberEditor
            label="Columns"
            value={parameters.columns}
            min={1}
            onChange={(columns) => update({ columns })}
          />
          <NumberEditor
            label="Spacing"
            value={parameters.spacing}
            min={1}
            onChange={(spacing) => update({ spacing })}
          />
          <NumberEditor
            label="Origin X"
            value={parameters.originX}
            onChange={(originX) => update({ originX })}
          />
          <NumberEditor
            label="Origin Y"
            value={parameters.originY}
            onChange={(originY) => update({ originY })}
          />
        </div>
      )}

      {shape === "circle" && (
        <div className="grid grid-cols-2 gap-2">
          <NumberEditor
            label="Rings"
            value={parameters.rings}
            min={1}
            onChange={(rings) => update({ rings })}
          />
          <NumberEditor
            label="Ring increment"
            value={parameters.increment}
            min={1}
            onChange={(increment) => update({ increment })}
          />
          <NumberEditor
            label="Ring gap"
            value={parameters.gap}
            min={1}
            onChange={(gap) => update({ gap })}
          />
          <NumberEditor
            label="Center X"
            value={parameters.centerX}
            onChange={(centerX) => update({ centerX })}
          />
          <NumberEditor
            label="Center Y"
            value={parameters.centerY}
            onChange={(centerY) => update({ centerY })}
          />
        </div>
      )}

      {shape === "formula" && (
        <div className="flex flex-col gap-2">
          <TextEditor
            label="X formula"
            value={parameters.formulaX}
            onChange={(formulaX) => update({ formulaX })}
          />
          <TextEditor
            label="Y formula"
            value={parameters.formulaY}
            onChange={(formulaY) => update({ formulaY })}
          />
          <div className="grid grid-cols-3 gap-2">
            <NumberEditor
              label="t start"
              value={parameters.tStart}
              step={0.1}
              onChange={(tStart) => update({ tStart })}
            />
            <NumberEditor
              label="t end"
              value={parameters.tEnd}
              step={0.1}
              onChange={(tEnd) => update({ tEnd })}
            />
            <NumberEditor
              label="Scale"
              value={parameters.scale}
              min={0.01}
              step={0.1}
              onChange={(scale) => update({ scale })}
            />
          </div>
          <p className="text-muted-foreground text-[9px] leading-relaxed">
            Canvas evaluates the safe formula preview after Apply to Draft.
          </p>
        </div>
      )}

      {shape === "custom" && (
        <div className="flex flex-col gap-1.5">
          <Button
            size="xs"
            variant="outline"
            className="self-start"
            onClick={() => update({ customFixtures: gridPositions(fixtureIds, parameters) })}
          >
            <Grid3X3 data-icon="inline-start" aria-hidden="true" />
            Reset coordinates to grid
          </Button>
          <div className="max-h-44 overflow-y-auto rounded border border-zinc-800">
            {fixtureIds.map((id) => {
              const fixture = customPosition(id, fixtureIds, parameters);
              return (
                <div
                  key={id}
                  className="grid grid-cols-[3rem_1fr_1fr] items-end gap-1.5 border-b border-zinc-800/70 p-1.5 last:border-0"
                >
                  <span className="pb-2 font-mono text-[9px] text-zinc-500">#{id}</span>
                  <NumberEditor
                    label={`Fixture ${id} X`}
                    shortLabel="X"
                    value={fixture.x}
                    onChange={(x) => updateCustom(fixture, { x }, parameters, update)}
                  />
                  <NumberEditor
                    label={`Fixture ${id} Y`}
                    shortLabel="Y"
                    value={fixture.y}
                    onChange={(y) => updateCustom(fixture, { y }, parameters, update)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LayoutMiniMap({
  shape,
  fixtureIds,
  parameters,
}: {
  shape: EditableLayoutShape;
  fixtureIds: number[];
  parameters: StageLayoutParameters;
}) {
  const positions = useMemo(() => {
    if (shape === "formula") return [];
    return layoutPositions(buildLayout(shape, fixtureIds, parameters), fixtureIds);
  }, [fixtureIds, parameters, shape]);
  const bounds = positionBounds(positions);

  return (
    <div
      className="relative h-24 overflow-hidden rounded border border-cyan-900/50 bg-cyan-950/10"
      aria-label={`${shape} layout preview`}
    >
      {positions.length > 0 ? (
        <svg
          className="h-full w-full"
          viewBox="0 0 240 96"
          role="img"
          aria-label={`${positions.length} fixture layout preview`}
        >
          {positions.map((fixture) => (
            <circle
              key={fixture.id}
              cx={12 + ((fixture.x - bounds.minX) / bounds.width) * 216}
              cy={12 + ((fixture.y - bounds.minY) / bounds.height) * 72}
              r="4"
              className="fill-cyan-300 stroke-cyan-50"
              strokeWidth="1"
            />
          ))}
        </svg>
      ) : (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <span className="font-mono text-xs text-cyan-200">x(t) / y(t)</span>
          <span className="text-muted-foreground mt-1 text-[9px]">
            {fixtureIds.length} fixtures · backend-evaluated
          </span>
        </div>
      )}
      <span className="absolute top-1 right-1 rounded bg-zinc-950/70 px-1.5 py-0.5 text-[8px] text-zinc-400 uppercase">
        {shape}
      </span>
    </div>
  );
}

function NumberEditor({
  label,
  shortLabel,
  value,
  min,
  step,
  onChange,
}: {
  label: string;
  shortLabel?: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const id = `layout-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-[9px] text-zinc-500">
        {shortLabel ?? label}
      </Label>
      <Input
        id={id}
        aria-label={label}
        type="number"
        value={value}
        min={min}
        step={step}
        className="h-7 px-2 text-xs"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function TextEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `layout-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-[9px] text-zinc-500">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        className="h-7 font-mono text-[10px]"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function updateCustom(
  fallback: { id: number; x: number; y: number },
  changes: Partial<{ x: number; y: number }>,
  parameters: StageLayoutParameters,
  update: (changes: Partial<StageLayoutParameters>) => void,
) {
  const { id } = fallback;
  update({
    customFixtures: parameters.customFixtures.some((fixture) => fixture.id === id)
      ? parameters.customFixtures.map((fixture) =>
          fixture.id === id ? { ...fixture, ...changes } : fixture,
        )
      : [...parameters.customFixtures, { ...fallback, ...changes }],
  });
}

function customPosition(id: number, fixtureIds: number[], parameters: StageLayoutParameters) {
  const existing = parameters.customFixtures.find((fixture) => fixture.id === id);
  if (existing) return existing;
  const index = Math.max(0, fixtureIds.indexOf(id));
  const columns = Math.max(1, Math.min(parameters.columns, Math.max(1, fixtureIds.length)));
  return {
    id,
    x: parameters.originX + (index % columns) * parameters.spacing,
    y: parameters.originY + Math.floor(index / columns) * parameters.spacing,
  };
}

function gridPositions(fixtureIds: number[], parameters: StageLayoutParameters) {
  const columns = Math.max(1, Math.min(parameters.columns, Math.max(1, fixtureIds.length)));
  return fixtureIds.map((id, index) => ({
    id,
    x: parameters.originX + (index % columns) * parameters.spacing,
    y: parameters.originY + Math.floor(index / columns) * parameters.spacing,
  }));
}

function positionBounds(positions: Array<{ x: number; y: number }>) {
  const xs = positions.map(({ x }) => x);
  const ys = positions.map(({ y }) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    minX,
    minY,
    width: Math.max(1, Math.max(...xs) - minX),
    height: Math.max(1, Math.max(...ys) - minY),
  };
}
