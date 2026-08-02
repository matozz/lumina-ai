import { useEffect, useRef } from "react";
import { Ban, Pause, Play, Square } from "lucide-react";
import { engine } from "@/bridge/commands";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { engineActions, engineSelectors, useEngineStore } from "@/stores/engine";
import { workspaceActions } from "@/stores/workspace";

export function LiveTransportControls() {
  const transportState = useEngineStore(engineSelectors.transportState);
  const blackout = useEngineStore(engineSelectors.blackout);
  const isPlaying = transportState === "playing";

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    try {
      await action();
    } catch (error) {
      workspaceActions.setPublishStatus("error", error instanceof Error ? error.message : fallback);
    }
  };

  const play = () =>
    run(async () => {
      await engine.setSequencerMode("live");
      engineActions.setSequencerMode("live");
      await engine.play();
    }, "Transport could not start.");

  return (
    <section className="border-border rounded-md border p-2" aria-label="Rehearsal transport">
      <div className="grid grid-cols-3 gap-1.5">
        <Button
          size="sm"
          className="bg-primary text-primary-foreground"
          disabled={isPlaying}
          onClick={() => void play()}
          aria-label={transportState === "paused" ? "Resume rehearsal" : "Play rehearsal"}
        >
          <Play data-icon="inline-start" aria-hidden="true" />
          {transportState === "paused" ? "Resume" : "Play"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-500/40 text-amber-300"
          disabled={!isPlaying}
          onClick={() => void run(engine.pause, "Transport could not pause.")}
        >
          <Pause data-icon="inline-start" aria-hidden="true" />
          Pause
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-muted-foreground"
          disabled={transportState === "stopped"}
          onClick={() => void run(engine.stop, "Transport could not stop.")}
          title="Stop and return to song start"
        >
          <Square data-icon="inline-start" aria-hidden="true" />
          Stop
        </Button>
      </div>

      <LiveBeatMeter />

      <Button
        variant="destructive"
        className={cn(
          "mt-2 h-11 w-full border-2 text-sm font-black tracking-[0.16em] uppercase",
          blackout
            ? "border-red-200 bg-red-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]"
            : "border-red-500/50 bg-red-950/70 text-red-200 hover:bg-red-900",
        )}
        aria-pressed={blackout}
        onClick={() =>
          void run(() => engine.setBlackout(!blackout), "Blackout state could not change.")
        }
      >
        <Ban data-icon="inline-start" aria-hidden="true" />
        {blackout ? "Release blackout" : "Blackout"}
      </Button>
      <p className="text-muted-foreground mt-1.5 text-[10px] leading-relaxed">
        Pause holds song time. Stop returns to the start. Blackout only latches lighting output.
      </p>
    </section>
  );
}

function LiveBeatMeter() {
  const refs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    let lastBeat = -1;
    const update = () => {
      const state = useEngineStore.getState();
      const beat = state.transportState === "playing" ? Math.floor(state.globalBeat) % 4 : -1;
      if (beat === lastBeat) return;
      lastBeat = beat;
      refs.current.forEach((element, index) => {
        if (!element) return;
        element.dataset.active = String(index === beat);
      });
    };
    update();
    return useEngineStore.subscribe(update);
  }, []);

  return (
    <div className="mt-2 flex items-center justify-center gap-3" aria-label="Four beat bar meter">
      {[0, 1, 2, 3].map((beat) => (
        <span
          key={beat}
          ref={(element) => {
            refs.current[beat] = element;
          }}
          className={cn(
            "size-2.5 rounded-full bg-zinc-800 transition-colors motion-reduce:transition-none",
            beat === 0 ? "data-[active=true]:bg-red-400" : "data-[active=true]:bg-emerald-400",
          )}
          data-active="false"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
