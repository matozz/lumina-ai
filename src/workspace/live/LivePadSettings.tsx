import type { LiveEffectInfo } from "@/bridge/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { engineSelectors, useEngineStore } from "@/stores/engine";
import {
  type LivePadMode,
  useWorkspaceStore,
  workspaceActions,
  workspaceSelectors,
} from "@/stores/workspace";
import { configFor } from "./livePadConfig";

export function LivePadSettings({
  effects,
  selectedEffectId,
}: {
  effects: LiveEffectInfo[];
  selectedEffectId: string | null;
}) {
  const configs = useWorkspaceStore(workspaceSelectors.livePadConfigs);
  const draft = useEngineStore(engineSelectors.parsedDsl);
  const effect = effects.find((candidate) => candidate.instance_id === selectedEffectId);
  if (!effect) return null;
  const config = configFor(effect.instance_id, configs);
  const draftDefinition = draft?.effect_definitions.find(
    (candidate) => candidate.id === effect.definition_id,
  );
  const draftAhead =
    (draftDefinition?.revision ?? effect.definition_revision) > effect.definition_revision;

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
        {draftAhead && (
          <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-300">
            Draft newer
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
          Pad behavior
          <select
            value={config.mode}
            onChange={(event) => update({ mode: event.target.value as LivePadMode })}
            className="border-input bg-background focus-visible:ring-ring h-8 rounded-md border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
            aria-label="Live Pad behavior"
          >
            <option value="toggle">Toggle</option>
            <option value="momentary">Momentary</option>
            <option value="one_shot">One-shot</option>
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <Label htmlFor="exclusive-group" className="text-[10px] text-zinc-400">
            Exclusive group
          </Label>
          <Input
            id="exclusive-group"
            value={config.exclusiveGroup}
            placeholder="Optional"
            className="h-8 text-xs"
            onChange={(event) => update({ exclusiveGroup: event.target.value })}
          />
        </div>
      </div>
      {config.mode === "one_shot" && (
        <div className="mt-2 flex items-center gap-2">
          <Label htmlFor="one-shot-beats" className="text-[10px] text-zinc-400">
            One-shot beats
          </Label>
          <Input
            id="one-shot-beats"
            type="number"
            min={0.25}
            max={256}
            step={0.25}
            value={config.oneShotBeats}
            className="h-7 w-20 text-xs"
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) {
                update({ oneShotBeats: Math.min(256, Math.max(0.25, value)) });
              }
            }}
          />
        </div>
      )}
    </section>
  );
}
