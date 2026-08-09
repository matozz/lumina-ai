import { Plus, Trash2 } from "lucide-react";
import { BeatSyncSpeedSelect } from "@/authoring/BeatSyncSpeedSelect";
import type { ParameterDefinitionDSL, ParameterValueDSL } from "@/bridge/types";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";

export function EffectParameterInput({
  parameter,
  readOnly,
  onChange,
}: {
  parameter: ParameterDefinitionDSL;
  readOnly: boolean;
  onChange: (value: ParameterValueDSL) => void;
}) {
  const value = parameter.default_value;
  if (value.type === "scalar") {
    if (parameter.id === "speed" && parameter.unit === "multiplier") {
      return (
        <BeatSyncSpeedSelect
          id={`effect-parameter-${parameter.id}`}
          value={value.value}
          disabled={readOnly}
          onChange={(next) => next !== null && onChange({ type: "scalar", value: next })}
        />
      );
    }
    return <ScalarInput parameter={parameter} readOnly={readOnly} onChange={onChange} />;
  }
  if (value.type === "color") {
    return (
      <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] gap-2">
        <Input
          id={`effect-parameter-${parameter.id}`}
          aria-label={`${parameter.name} color picker`}
          className="h-6 p-0.5"
          type="color"
          value={validColorInput(value.value) ? value.value : "#000000"}
          disabled={readOnly}
          onChange={(event) => onChange({ type: "color", value: event.currentTarget.value })}
        />
        <Input
          aria-label={`${parameter.name} color value`}
          className="h-6 font-mono text-[10px]"
          value={value.value}
          disabled={readOnly}
          onChange={(event) => onChange({ type: "color", value: event.currentTarget.value })}
        />
      </div>
    );
  }
  if (value.type === "direction") {
    return (
      <ValueSelect
        id={`effect-parameter-${parameter.id}`}
        value={value.value}
        values={["forward", "reverse"]}
        disabled={readOnly}
        onChange={(next) => onChange({ type: "direction", value: next as "forward" | "reverse" })}
      />
    );
  }
  if (value.type === "boolean") {
    return (
      <Toggle
        id={`effect-parameter-${parameter.id}`}
        variant="outline"
        size="sm"
        pressed={value.value}
        disabled={readOnly}
        onPressedChange={(next) => onChange({ type: "boolean", value: next })}
      >
        {value.value ? "Enabled" : "Disabled"}
      </Toggle>
    );
  }
  if (value.type === "enum") {
    return (
      <ValueSelect
        id={`effect-parameter-${parameter.id}`}
        value={value.value}
        values={parameter.enum_values ?? []}
        disabled={readOnly}
        onChange={(next) => onChange({ type: "enum", value: next })}
      />
    );
  }
  return (
    <ColorStopsInput
      parameterId={parameter.id}
      stops={value.value}
      readOnly={readOnly}
      onChange={(stops) => onChange({ type: "color_stops", value: stops })}
    />
  );
}

function ScalarInput({
  parameter,
  readOnly,
  onChange,
}: {
  parameter: ParameterDefinitionDSL;
  readOnly: boolean;
  onChange: (value: ParameterValueDSL) => void;
}) {
  const value = parameter.default_value;
  if (value.type !== "scalar") return null;
  const [minimum, maximum] = parameter.range ?? [0, 1];
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-2">
      {parameter.range ? (
        <Slider
          id={`effect-parameter-${parameter.id}`}
          min={minimum}
          max={maximum}
          step={parameter.step ?? 0.01}
          value={[value.value]}
          disabled={readOnly}
          onValueChange={(next) =>
            onChange({
              type: "scalar",
              value: typeof next === "number" ? next : (next[0] ?? value.value),
            })
          }
        />
      ) : (
        <span className="text-muted-foreground text-[10px]">Unbounded scalar</span>
      )}
      <Input
        aria-label={`${parameter.name} numeric value`}
        className="h-6 font-mono text-[10px] tabular-nums"
        type="number"
        min={parameter.range?.[0]}
        max={parameter.range?.[1]}
        step={parameter.step ?? "any"}
        value={value.value}
        disabled={readOnly}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) onChange({ type: "scalar", value: next });
        }}
      />
    </div>
  );
}

function ValueSelect({
  id,
  value,
  values,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  values: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const items = values.map((item) => ({ value: item, label: item.replace(/_/g, " ") }));
  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(next) => next && onChange(next)}
    >
      <SelectTrigger id={id} size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ColorStopsInput({
  parameterId,
  stops,
  readOnly,
  onChange,
}: {
  parameterId: string;
  stops: Array<{ color: string; position: number }>;
  readOnly: boolean;
  onChange: (stops: Array<{ color: string; position: number }>) => void;
}) {
  const updateStop = (index: number, update: Partial<(typeof stops)[number]>) => {
    const next = structuredClone(stops);
    next[index] = { ...next[index], ...update };
    onChange(next);
  };
  return (
    <div className="grid gap-1.5" id={`effect-parameter-${parameterId}`}>
      {stops.map((stop, index) => (
        <div key={index} className="grid grid-cols-[2.5rem_1fr_4rem_auto] items-center gap-1.5">
          <Input
            aria-label={`Color stop ${index + 1} color`}
            className="h-6 p-0.5"
            type="color"
            value={validColorInput(stop.color) ? stop.color : "#000000"}
            disabled={readOnly}
            onChange={(event) => updateStop(index, { color: event.currentTarget.value })}
          />
          <Slider
            aria-label={`Color stop ${index + 1} position`}
            min={0}
            max={1}
            step={0.01}
            value={[stop.position]}
            disabled={readOnly}
            onValueChange={(next) =>
              updateStop(index, {
                position: typeof next === "number" ? next : (next[0] ?? stop.position),
              })
            }
          />
          <Input
            aria-label={`Color stop ${index + 1} numeric position`}
            className="h-6 font-mono text-[10px]"
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={stop.position}
            disabled={readOnly}
            onChange={(event) => {
              const position = Number(event.currentTarget.value);
              if (Number.isFinite(position)) updateStop(index, { position });
            }}
          />
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Remove color stop ${index + 1}`}
            disabled={readOnly || stops.length <= 2}
            onClick={() => onChange(stops.filter((_, candidate) => candidate !== index))}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        size="xs"
        variant="outline"
        disabled={readOnly}
        onClick={() =>
          onChange([
            ...stops,
            {
              color: stops[stops.length - 1]?.color ?? "#ffffff",
              position: Math.min(1, (stops[stops.length - 1]?.position ?? 0) + 0.1),
            },
          ])
        }
      >
        <Plus data-icon="inline-start" aria-hidden="true" />
        Add stop
      </Button>
      <FieldDescription>
        Stop order is preserved; validation reports overlaps or reversals.
      </FieldDescription>
    </div>
  );
}

function validColorInput(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}
