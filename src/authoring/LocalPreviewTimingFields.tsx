import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { LocalPreviewTiming } from "./musicalTime";

interface LocalPreviewTimingFieldsProps {
  sessionKey: string;
  timing: LocalPreviewTiming;
  onCommit: (field: keyof LocalPreviewTiming, value: number) => void;
}

export function LocalPreviewTimingFields({
  sessionKey,
  timing,
  onCommit,
}: LocalPreviewTimingFieldsProps) {
  return (
    <FieldGroup className="flex-row gap-1.5">
      <TimingInput
        id={`${sessionKey}-bpm`}
        label="Local BPM"
        value={timing.bpm}
        min={1}
        max={1_000}
        step={1}
        onCommit={(value) => onCommit("bpm", value)}
      />
      <TimingInput
        id={`${sessionKey}-numerator`}
        label="Local meter numerator"
        value={timing.numerator}
        min={1}
        max={32}
        step={1}
        onCommit={(value) => onCommit("numerator", value)}
      />
      <span className="text-muted-foreground self-center text-xs">/</span>
      <TimingInput
        id={`${sessionKey}-denominator`}
        label="Local meter denominator"
        value={timing.denominator}
        min={1}
        max={32}
        step={1}
        onCommit={(value) => onCommit("denominator", value)}
      />
      <TimingInput
        id={`${sessionKey}-bars`}
        label="Local loop bars"
        value={timing.loopBars}
        min={1}
        max={256}
        step={1}
        suffix="bars"
        onCommit={(value) => onCommit("loopBars", value)}
      />
    </FieldGroup>
  );
}

interface TimingInputProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onCommit: (value: number) => void;
}

function TimingInput({ id, label, value, min, max, step, suffix, onCommit }: TimingInputProps) {
  return (
    <Field orientation="horizontal" className="gap-1">
      <FieldLabel htmlFor={id} className="sr-only">
        {label}
      </FieldLabel>
      <Input
        key={`${id}:${value}`}
        id={id}
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        className="h-7 w-16 px-2 text-[10px]"
        onBlur={(event) => onCommit(Number(event.currentTarget.value))}
      />
      {suffix && <span className="text-muted-foreground text-[10px]">{suffix}</span>}
    </Field>
  );
}
