import { useEngineStore, engineActions, engineSelectors, SequencerMode } from "@/stores/engine";
import { engine } from "@/bridge/commands";
import { Play, Pause, Square, Activity, Clock, Settings2, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const ControlPanel = () => {
  const isPlaying = useEngineStore(engineSelectors.isPlaying);
  const tempo = useEngineStore(engineSelectors.tempo);
  const compileResult = useEngineStore(engineSelectors.compileResult);
  const activePhasers = useEngineStore(engineSelectors.activePhasers);
  const sequencerMode = useEngineStore(engineSelectors.sequencerMode);

  const handlePlay = async () => {
    if (isPlaying) {
      await engine.pause();
    } else {
      await engine.play();
    }
  };

  const handleStop = async () => {
    await engine.stop();
  };

  const handleTempoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTempo = parseInt(e.target.value, 10);
    await engine.setTempo(newTempo);
    engineActions.setTempo(newTempo);
  };

  const handleModeChange = async (mode: SequencerMode) => {
    try {
      if (mode !== sequencerMode) {
        await engine.stop();
        engineActions.setActivePhasers([]); // Explicitly clear UI state
      }
      await engine.setSequencerMode(mode);
      engineActions.setSequencerMode(mode);
    } catch (e) {
      console.error("Failed to change sequencer mode", e);
    }
  };

  const handlePhaserToggle = async (id: string, multiplier: number = 1.0) => {
    const needsPlay = !isPlaying || sequencerMode !== "live";
    if (sequencerMode !== "live") {
      await handleModeChange("live");
    }

    if (needsPlay) {
      await engine.play();
    }

    const activePhaser = activePhasers.find((p) => p.id === id);

    if (activePhaser) {
      if (activePhaser.multiplier === multiplier) {
        await engine.stopPhaser(id);
      } else {
        await engine.triggerPhaser(id, multiplier);
      }
    } else {
      await engine.triggerPhaser(id, multiplier);
    }
  };

  const globalBeat = useEngineStore(engineSelectors.globalBeat);
  const currentBeatInBar = Math.floor(globalBeat) % 4;

  return (
    <div
      className={cn(
        "z-10 flex min-h-0 w-[clamp(13rem,18vw,16rem)] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-xl",
      )}
      data-layout-region="inspector"
    >
      {/* Header */}
      <div
        className={cn(
          "flex h-10 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 backdrop-blur-md",
        )}
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-semibold tracking-wide text-zinc-200">CONTROL</span>
        </div>
      </div>

      <div className="custom-scrollbar flex flex-1 flex-col overflow-y-auto p-3">
        {/* Mode Switcher */}
        <div
          className={cn("mb-3 flex rounded border border-zinc-800/80 bg-zinc-900 p-1 shadow-inner")}
        >
          <Button
            variant="ghost"
            onClick={() => handleModeChange("live")}
            className={cn(
              "flex h-auto flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-[10px] font-bold tracking-wider transition-all",
              sequencerMode === "live"
                ? "bg-zinc-800 text-white shadow-sm hover:bg-zinc-800 hover:text-white"
                : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300",
            )}
          >
            <Activity size={12} />
            LIVE PAD
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleModeChange("timeline")}
            className={cn(
              "flex h-auto flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-[10px] font-bold tracking-wider transition-all",
              sequencerMode === "timeline"
                ? "bg-zinc-800 text-white shadow-sm hover:bg-zinc-800 hover:text-white"
                : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300",
            )}
          >
            <Clock size={12} />
            TIMELINE
          </Button>
        </div>

        {/* Transport Controls */}
        <div className="mb-3 flex gap-1.5">
          <Button
            variant="default"
            onClick={handlePlay}
            className={cn(
              "flex h-auto flex-1 items-center justify-center gap-1.5 rounded px-3 py-2 text-[11px] font-bold tracking-wider transition-all",
              isPlaying
                ? "bg-zinc-800 text-amber-400 shadow-inner hover:bg-zinc-700 hover:text-amber-300"
                : "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-500",
            )}
          >
            {isPlaying ? (
              <Pause size={12} fill="currentColor" />
            ) : (
              <Play size={12} fill="currentColor" />
            )}
            {isPlaying ? "PAUSE" : "PLAY"}
          </Button>

          <Button
            variant="outline"
            onClick={handleStop}
            className={cn(
              "flex h-auto items-center justify-center rounded px-3 py-2 transition-all",
              "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
            )}
            title="Stop and Return to Start"
          >
            <Square size={12} fill="currentColor" />
          </Button>
        </div>

        {/* Beat Indicators */}
        <div
          className={cn(
            "mb-3 flex justify-evenly rounded border border-zinc-800/50 bg-zinc-900/50 px-3 py-2",
          )}
        >
          {[0, 1, 2, 3].map((b) => (
            <div
              key={b}
              className={cn(
                "h-2.5 w-2.5 rounded-full shadow-inner transition-colors duration-75",
                isPlaying && currentBeatInBar === b
                  ? b === 0
                    ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                    : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : "bg-zinc-800",
              )}
            />
          ))}
        </div>

        {/* Tempo Control */}
        <div className="mb-3 rounded border border-zinc-800/50 bg-zinc-900/30 p-2.5">
          <div className="mb-1 flex items-start justify-between">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Clock size={12} />
              <span className="text-[10px] font-bold tracking-widest uppercase">Tempo</span>
            </div>
            <span
              className={cn(
                "rounded border border-emerald-500/20 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-400",
              )}
            >
              {tempo} BPM
            </span>
          </div>
          <input
            type="range"
            min="30"
            max="300"
            value={tempo}
            onChange={handleTempoChange}
            className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-emerald-500 transition-all hover:accent-emerald-400"
          />
        </div>

        {/* Dynamic Panel Content Based on Mode */}
        {sequencerMode === "live" && (
          <div className="flex flex-1 flex-col">
            <div className="mb-2.5 flex items-center gap-1.5 text-zinc-500">
              <SlidersHorizontal size={12} />
              <span className="text-[10px] font-bold tracking-widest uppercase">Live Pads</span>
            </div>
            <div className={cn("grid grid-cols-2 gap-2")}>
              {compileResult?.phasers.map((phaserInfo) => {
                const activePhaser = activePhasers.find((p) => p.id === phaserInfo.id);
                const isActive = !!activePhaser;
                const currentMultiplier = activePhaser?.multiplier ?? 1.0;

                return (
                  <div key={phaserInfo.id} className="flex flex-col gap-1">
                    <Button
                      variant="outline"
                      onClick={() => handlePhaserToggle(phaserInfo.id, currentMultiplier)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 rounded-lg border p-2 text-[11px] font-medium transition-all",
                        isActive ? "h-14" : "h-20",
                        isActive
                          ? "border-indigo-500/50 bg-indigo-500/20 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.15)] hover:bg-indigo-500/30 hover:text-indigo-200"
                          : "border-zinc-800 bg-zinc-900/80 text-zinc-500 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-300",
                      )}
                    >
                      <div
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full transition-all",
                          isActive
                            ? "bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]"
                            : "bg-zinc-800",
                        )}
                      />
                      <span className="line-clamp-2 w-full px-1 text-center leading-tight wrap-break-word whitespace-normal">
                        {phaserInfo.name}
                      </span>
                    </Button>

                    {isActive && (
                      <div className="flex h-5 gap-1">
                        <Button
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePhaserToggle(
                              phaserInfo.id,
                              Math.max(0.125, currentMultiplier * 0.5),
                            );
                          }}
                          className={cn(
                            "h-full min-h-0 flex-1 rounded px-0 text-[9px] font-bold transition-colors",
                            currentMultiplier < 1.0
                              ? "border-indigo-500/50 bg-indigo-500/20 text-indigo-300"
                              : "border-zinc-800 bg-zinc-900/80 text-zinc-500 hover:bg-zinc-800",
                          )}
                        >
                          {currentMultiplier < 1.0 ? `${currentMultiplier}x` : ".5x"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePhaserToggle(phaserInfo.id, Math.min(8.0, currentMultiplier * 2));
                          }}
                          className={cn(
                            "h-full min-h-0 flex-1 rounded px-0 text-[9px] font-bold transition-colors",
                            currentMultiplier > 1.0
                              ? "border-indigo-500/50 bg-indigo-500/20 text-indigo-300"
                              : "border-zinc-800 bg-zinc-900/80 text-zinc-500 hover:bg-zinc-800",
                          )}
                        >
                          {currentMultiplier > 1.0 ? `${currentMultiplier}x` : "2x"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {(!compileResult || compileResult.phasers.length === 0) && (
                <div
                  className={cn(
                    "col-span-2 flex h-20 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 text-zinc-600",
                  )}
                >
                  <Square size={14} className="opacity-50" />
                  <span className="text-[10px] font-bold tracking-widest uppercase">Empty</span>
                </div>
              )}
            </div>
          </div>
        )}

        {sequencerMode === "timeline" && (
          <div
            className={cn(
              "flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-800/30 p-4 text-center opacity-50",
            )}
          >
            <Clock size={16} className="mb-2 text-zinc-400" />
            <p className="text-xs font-bold tracking-widest text-zinc-400 uppercase">
              Timeline Active
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
              Sequencer control delegated to timeline panel.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
