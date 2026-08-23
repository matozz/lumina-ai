import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BEAT_SYNC_SPEED_MULTIPLIERS,
  isBeatSyncSpeedMultiplier,
  speedMultiplierLabel,
} from "./speedMultipliers";

export function BeatSyncSpeedSelect({
  id,
  value,
  defaultLabel,
  labelForValue = speedMultiplierLabel,
  disabled = false,
  onChange,
}: {
  id?: string;
  value: number | null;
  defaultLabel?: string;
  labelForValue?: (value: number) => string;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  const currentValue = value === null ? "__default__" : String(value);
  const unsupported = value !== null && !isBeatSyncSpeedMultiplier(value);
  const items = [
    ...(defaultLabel ? [{ value: "__default__", label: defaultLabel, disabled: false }] : []),
    ...(unsupported
      ? [
          {
            value: currentValue,
            label: `${currentValue}× · choose a beat-synced ratio`,
            disabled: true,
          },
        ]
      : []),
    ...BEAT_SYNC_SPEED_MULTIPLIERS.map((multiplier) => ({
      value: String(multiplier),
      label: labelForValue(multiplier),
      disabled: false,
    })),
  ];

  return (
    <Select
      items={items}
      value={currentValue}
      disabled={disabled}
      onValueChange={(next) => {
        if (!next) return;
        onChange(next === "__default__" ? null : Number(next));
      }}
    >
      <SelectTrigger id={id} size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
