import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { EffectFormValues } from "./effectFactory";

export function EffectParameterControls({
  values,
  onChange,
}: {
  values: EffectFormValues;
  onChange: (key: "speed" | "phase" | "width" | "transition", value: number) => void;
}) {
  return (
    <div className="border-border grid gap-3 rounded-md border p-2.5">
      <ParameterSlider
        label="Speed"
        value={values.speed}
        min={0.125}
        max={8}
        step={0.125}
        suffix="×"
        onChange={(value) => onChange("speed", value)}
      />
      <ParameterSlider
        label="Phase"
        value={values.phase}
        min={-1}
        max={1}
        step={0.01}
        suffix=" cyc"
        onChange={(value) => onChange("phase", value)}
      />
      <ParameterSlider
        label="Width"
        value={values.width}
        min={1}
        max={100}
        step={1}
        suffix="%"
        onChange={(value) => onChange("width", value)}
      />
      <ParameterSlider
        label="Transition"
        value={values.transition}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onChange={(value) => onChange("transition", value)}
      />
    </div>
  );
}

export function effectNumbersAreValid(values: EffectFormValues) {
  return (
    Number.isFinite(values.speed) &&
    values.speed >= 0.125 &&
    values.speed <= 8 &&
    Number.isFinite(values.phase) &&
    values.phase >= -1 &&
    values.phase <= 1 &&
    Number.isFinite(values.width) &&
    values.width >= 1 &&
    values.width <= 100 &&
    Number.isFinite(values.transition) &&
    values.transition >= 0 &&
    values.transition <= 100
  );
}

function ParameterSlider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2">
      <Label className="text-[10px]">{label}</Label>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(next) => onChange(typeof next === "number" ? next : (next[0] ?? value))}
      />
      <span className="bg-background border-border rounded border px-1.5 py-1 text-right font-mono text-[10px] tabular-nums">
        {formatNumber(value)}
        {suffix}
      </span>
    </div>
  );
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/0+$/, "");
}
