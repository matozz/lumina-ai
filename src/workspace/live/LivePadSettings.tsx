import type { LiveEffectInfo } from "@/bridge/types";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type LivePadMode,
  useWorkspaceStore,
  workspaceActions,
  workspaceSelectors,
} from "@/stores/workspace";
import { configFor } from "./livePadConfig";

const PAD_MODE_ITEMS: Array<{ label: string; value: LivePadMode }> = [
  { label: "Toggle", value: "toggle" },
  { label: "Momentary", value: "momentary" },
  { label: "One-shot", value: "one_shot" },
];

export function LivePadSettings({
  effects,
  selectedEffectId,
}: {
  effects: LiveEffectInfo[];
  selectedEffectId: string | null;
}) {
  const configs = useWorkspaceStore(workspaceSelectors.livePadConfigs);
  const effect = effects.find((candidate) => candidate.instance_id === selectedEffectId);
  if (!effect) return null;
  const config = configFor(effect.instance_id, configs);

  const update = (changes: Partial<typeof config>) => {
    workspaceActions.setLivePadConfig(effect.instance_id, { ...config, ...changes });
  };

  return (
    <section
      className="border-border rounded-md border p-2"
      aria-label="Selected Live Pad settings"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{effect.name}</p>
          <p className="text-muted-foreground text-[9px]">Fixtures: {effect.target_group_id}</p>
        </div>
      </div>
      <FieldGroup className="grid grid-cols-2 gap-2">
        <Field className="gap-1">
          <FieldLabel className="text-zinc-400">Pad behavior</FieldLabel>
          <Select
            items={PAD_MODE_ITEMS}
            value={config.mode}
            onValueChange={(value) => value && update({ mode: value })}
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Live Pad behavior">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {PAD_MODE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="gap-1">
          <FieldLabel htmlFor="exclusive-group" className="text-zinc-400">
            Exclusive group
          </FieldLabel>
          <Input
            id="exclusive-group"
            value={config.exclusiveGroup}
            placeholder="Optional"
            onChange={(event) => update({ exclusiveGroup: event.target.value })}
          />
        </Field>
      </FieldGroup>
      {config.mode === "one_shot" && (
        <Field orientation="horizontal" className="mt-2 justify-start gap-2">
          <FieldLabel htmlFor="one-shot-beats" className="text-zinc-400">
            One-shot beats
          </FieldLabel>
          <Input
            id="one-shot-beats"
            type="number"
            min={0.25}
            max={256}
            step={0.25}
            value={config.oneShotBeats}
            className="h-6 w-20 text-xs"
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) {
                update({ oneShotBeats: Math.min(256, Math.max(0.25, value)) });
              }
            }}
          />
        </Field>
      )}
    </section>
  );
}
