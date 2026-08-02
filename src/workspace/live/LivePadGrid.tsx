import { useEffect, useState } from "react";
import { RadioTower } from "lucide-react";
import type { LiveEffectInfo } from "@/bridge/types";
import { engine } from "@/bridge/commands";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { engineActions, engineSelectors, useEngineStore } from "@/stores/engine";
import { useWorkspaceStore, workspaceActions, workspaceSelectors } from "@/stores/workspace";
import { configFor, exclusiveEffectIds } from "./livePadConfig";

type PendingPad = { action: "start" | "stop"; targetBeat: number };

export function LivePadGrid({ effects }: { effects: LiveEffectInfo[] }) {
  const active = useEngineStore(engineSelectors.activePhasers);
  const quantize = useWorkspaceStore(workspaceSelectors.livePadQuantize);
  const configs = useWorkspaceStore(workspaceSelectors.livePadConfigs);
  const [pending, setPending] = useState<Record<string, PendingPad>>({});

  useEffect(() => {
    setPending((current) => {
      const next = { ...current };
      let changed = false;
      for (const [effectId, queued] of Object.entries(current)) {
        const isActive = active.some((candidate) => candidate.id === effectId);
        if ((queued.action === "start" && isActive) || (queued.action === "stop" && !isActive)) {
          delete next[effectId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [active]);

  const queue = async (effect: LiveEffectInfo, action: "start" | "stop") => {
    const config = configFor(effect.instance_id, configs);
    try {
      if (useEngineStore.getState().transportState !== "playing") {
        await engine.setSequencerMode("live");
        engineActions.setSequencerMode("live");
        await engine.play();
      }
      const queued = await engine.queueLivePad({
        effectId: effect.instance_id,
        action,
        quantize,
        exclusiveIds: exclusiveEffectIds(effect, effects, configs),
        oneShotBeats: config.mode === "one_shot" ? config.oneShotBeats : undefined,
      });
      setPending((current) => ({
        ...current,
        [effect.instance_id]: { action, targetBeat: queued.target_beat },
      }));
      workspaceActions.setPublishStatus(
        "idle",
        `${effect.name} ${action === "start" ? "armed" : "release armed"} for beat ${formatBeat(queued.target_beat)}.`,
      );
    } catch (error) {
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : `${effect.name} could not be triggered.`,
      );
    }
  };

  return (
    <section aria-label="Quantized Live Pads">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
          Quantize
        </span>
        <div
          className="ml-auto flex rounded-md border border-zinc-800 p-0.5"
          role="group"
          aria-label="Live Pad quantize"
        >
          {(["off", "beat", "bar"] as const).map((option) => (
            <Button
              key={option}
              variant="ghost"
              size="xs"
              className={cn(
                "h-6 px-2 text-[9px] uppercase",
                quantize === option && "bg-zinc-800 text-white",
              )}
              aria-pressed={quantize === option}
              onClick={() => workspaceActions.setLivePadQuantize(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {effects.map((effect) => {
          const config = configFor(effect.instance_id, configs);
          const isActive = active.some((candidate) => candidate.id === effect.instance_id);
          const queued = pending[effect.instance_id];
          const armed = queued?.action === "start";
          const triggerProps =
            config.mode === "momentary"
              ? {
                  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
                    if (event.button !== 0) return;
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    void queue(effect, "start");
                  },
                  onPointerUp: () => void queue(effect, "stop"),
                  onPointerCancel: () => void queue(effect, "stop"),
                  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
                    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                      event.preventDefault();
                      void queue(effect, "start");
                    }
                  },
                  onKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => {
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      void queue(effect, "stop");
                    }
                  },
                }
              : {
                  onClick: () => void queue(effect, isActive || armed ? "stop" : "start"),
                };
          return (
            <Button
              key={effect.instance_id}
              variant="outline"
              className={cn(
                "h-16 min-w-0 flex-col gap-1 px-1.5 text-xs transition-colors motion-reduce:transition-none",
                (isActive || armed) && "border-amber-400/60 bg-amber-500/15 text-amber-200",
              )}
              aria-label={`${effect.name}, ${modeLabel(config.mode)} Live Pad`}
              aria-pressed={isActive || armed}
              onFocus={() => workspaceActions.setSelectedLiveEffectId(effect.instance_id)}
              {...triggerProps}
            >
              <span className="w-full truncate">{effect.name}</span>
              <span className="text-muted-foreground font-mono text-[9px]">
                {queued ? `@ ${formatBeat(queued.targetBeat)}` : modeLabel(config.mode)}
              </span>
            </Button>
          );
        })}
        {effects.length === 0 && (
          <div className="col-span-2 flex min-h-24 flex-col items-center justify-center rounded-md border border-dashed border-zinc-800 p-3 text-center">
            <RadioTower className="text-muted-foreground size-4" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium">No effects in Live Snapshot</p>
            <p className="text-muted-foreground mt-1 text-[10px] leading-relaxed">
              Publish the Draft, then explicitly Take live.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function modeLabel(mode: "toggle" | "momentary" | "one_shot") {
  return { toggle: "Toggle", momentary: "Momentary", one_shot: "One-shot" }[mode];
}

function formatBeat(beat: number) {
  return Number.isInteger(beat) ? String(beat) : beat.toFixed(2);
}
