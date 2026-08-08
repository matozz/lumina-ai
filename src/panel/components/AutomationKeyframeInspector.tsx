import { useId, useMemo, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { BeatSyncSpeedSelect } from "@/authoring/BeatSyncSpeedSelect";
import { isBeatSyncSpeedMultiplier } from "@/authoring/speedMultipliers";
import type {
  KeyframeDSL,
  KeyframeInterpolationDSL,
  ParameterDefinitionDSL,
  ParameterValueDSL,
  TempoMapDSL,
  TimeSignaturePoint,
} from "@/bridge/types";
import {
  formatMusicalPosition as formatMeterPosition,
  musicalPositionAtTick,
} from "@/authoring/musicalTime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PopoverDescription, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { formatMusicalPosition, formatSeconds, ticksToSeconds } from "../musicalTimeDisplay";

interface AutomationKeyframeInspectorProps {
  canDelete: boolean;
  definition: ParameterDefinitionDSL;
  keyframe: KeyframeDSL;
  maximumTick: number;
  minimumTick: number;
  onApply: (changes: Partial<Pick<KeyframeDSL, "time_tick" | "value" | "interpolation">>) => void;
  onDelete: () => void;
  ppq: number;
  tempoMap: TempoMapDSL;
  timeSignatures?: TimeSignaturePoint[];
}

const INTERPOLATIONS: KeyframeInterpolationDSL[] = [
  "hold",
  "linear",
  "ease_in",
  "ease_out",
  "ease_in_out",
  "bezier",
];

export const AutomationKeyframeInspector = ({
  canDelete,
  definition,
  keyframe,
  maximumTick,
  minimumTick,
  onApply,
  onDelete,
  ppq,
  tempoMap,
  timeSignatures,
}: AutomationKeyframeInspectorProps) => {
  const id = useId();
  const [timeTick, setTimeTick] = useState(String(keyframe.time_tick));
  const [value, setValue] = useState(valueForDisplay(keyframe.value, definition));
  const [interpolation, setInterpolation] = useState(keyframe.interpolation);
  const parsedTick = Number(timeTick);
  const parsedValue = parseValue(value, definition);
  const isTickValid =
    Number.isInteger(parsedTick) && parsedTick >= minimumTick && parsedTick <= maximumTick;
  const isValid = isTickValid && parsedValue !== undefined;
  const timeDescription = useMemo(
    () =>
      isTickValid
        ? `${timeSignatures ? formatMeterPosition(musicalPositionAtTick(parsedTick, ppq, timeSignatures)) : formatMusicalPosition(parsedTick, ppq)} · ${formatSeconds(ticksToSeconds(parsedTick, ppq, tempoMap))}`
        : "Enter a valid integer tick",
    [isTickValid, parsedTick, ppq, tempoMap, timeSignatures],
  );

  return (
    <div
      className="flex flex-col gap-3"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <PopoverHeader>
        <PopoverTitle>{definition.name} keyframe</PopoverTitle>
        <PopoverDescription>{timeDescription}</PopoverDescription>
      </PopoverHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-tick`}>Time tick</Label>
        <Input
          id={`${id}-tick`}
          type="number"
          min={minimumTick}
          max={maximumTick}
          step={1}
          value={timeTick}
          aria-invalid={!isTickValid}
          onChange={(event) => setTimeTick(event.target.value)}
        />
      </div>

      <TypedValueInput
        id={`${id}-value`}
        definition={definition}
        value={value}
        onChange={setValue}
        invalid={parsedValue === undefined}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-interpolation`}>Interpolation</Label>
        <Select
          value={interpolation}
          onValueChange={(next) => next && setInterpolation(next as KeyframeInterpolationDSL)}
        >
          <SelectTrigger id={`${id}-interpolation`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(definition.automation === "discrete" ? ["hold"] : INTERPOLATIONS).map((value) => (
                <SelectItem key={value} value={value}>
                  {value.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="destructive" size="sm" disabled={!canDelete} onClick={onDelete}>
          <Trash2 data-icon="inline-start" /> Delete
        </Button>
        <Button
          size="sm"
          disabled={!isValid}
          onClick={() => {
            if (!parsedValue) return;
            onApply({ time_tick: parsedTick, value: parsedValue, interpolation });
          }}
        >
          <Check data-icon="inline-start" /> Apply
        </Button>
      </div>
    </div>
  );
};

interface TypedValueInputProps {
  definition: ParameterDefinitionDSL;
  id: string;
  invalid: boolean;
  onChange: (value: string) => void;
  value: string;
}

const TypedValueInput = ({ definition, id, invalid, onChange, value }: TypedValueInputProps) => {
  if (definition.id === "speed" && definition.value_type === "scalar") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{definition.name} (×)</Label>
        <BeatSyncSpeedSelect
          id={id}
          value={Number(value)}
          onChange={(next) => next !== null && onChange(String(next))}
        />
      </div>
    );
  }
  if (definition.value_type === "direction") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{definition.name}</Label>
        <Select value={value} onValueChange={(next) => next && onChange(next)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="forward">Forward</SelectItem>
              <SelectItem value="reverse">Reverse</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (definition.value_type === "boolean") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{definition.name}</Label>
        <Select value={value} onValueChange={(next) => next && onChange(next)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="true">On</SelectItem>
              <SelectItem value="false">Off</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (definition.value_type === "enum") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{definition.name}</Label>
        <Select value={value} onValueChange={(next) => next && onChange(next)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(definition.enum_values ?? []).map((option) => (
                <SelectItem key={option} value={option}>
                  {option.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (definition.value_type === "color_stops") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{definition.name}</Label>
        <Input id={id} value="Edit this value in Effect Lab" disabled />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {definition.name} {unitLabel(definition)}
      </Label>
      <Input
        id={id}
        type={definition.value_type === "color" ? "color" : "number"}
        min={displayRange(definition)?.[0]}
        max={displayRange(definition)?.[1]}
        step={definition.value_type === "scalar" ? "any" : undefined}
        value={value}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
};

function valueForDisplay(value: ParameterValueDSL, definition: ParameterDefinitionDSL): string {
  switch (value.type) {
    case "scalar":
      return String(value.value * scalarDisplayScale(definition));
    case "boolean":
      return String(value.value);
    case "color_stops":
      return JSON.stringify(value.value);
    default:
      return value.value;
  }
}

function parseValue(
  value: string,
  definition: ParameterDefinitionDSL,
): ParameterValueDSL | undefined {
  if (definition.value_type === "color") {
    return /^#[0-9a-f]{6}$/i.test(value) ? { type: "color", value } : undefined;
  }
  if (definition.value_type === "direction") {
    return value === "forward" || value === "reverse" ? { type: "direction", value } : undefined;
  }
  if (definition.value_type === "boolean") {
    return value === "true" || value === "false"
      ? { type: "boolean", value: value === "true" }
      : undefined;
  }
  if (definition.value_type === "enum") {
    return (definition.enum_values ?? []).includes(value) ? { type: "enum", value } : undefined;
  }
  if (definition.value_type === "color_stops") return undefined;
  const parsed = Number(value) / scalarDisplayScale(definition);
  if (!Number.isFinite(parsed)) return undefined;
  if (definition.id === "speed" && !isBeatSyncSpeedMultiplier(parsed)) return undefined;
  const range = definition.range;
  if (range && (parsed < range[0] || parsed > range[1])) return undefined;
  return { type: "scalar", value: parsed };
}

function scalarDisplayScale(definition: ParameterDefinitionDSL): number {
  return definition.unit === "percent" && (definition.range?.[1] ?? 100) <= 1 ? 100 : 1;
}

function displayRange(definition: ParameterDefinitionDSL): [number, number] | undefined {
  return definition.range
    ? [
        definition.range[0] * scalarDisplayScale(definition),
        definition.range[1] * scalarDisplayScale(definition),
      ]
    : undefined;
}

function unitLabel(definition: ParameterDefinitionDSL): string {
  const labels: Record<ParameterDefinitionDSL["unit"], string> = {
    multiplier: "(×)",
    cycles: "(cycles)",
    percent: "(%)",
    normalized: "(0–1)",
    color: "",
    direction: "",
    degrees: "(°)",
    none: "",
    boolean: "",
    choice: "",
    color_stops: "",
  };
  return labels[definition.unit];
}
