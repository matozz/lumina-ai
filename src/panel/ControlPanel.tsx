import { useUiStore, SequencerMode } from "../stores/uiStore";
import { engine } from "../bridge/commands";
import { Play, Pause, Square, Activity, Clock, Settings2, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ControlPanel() {
  const { isPlaying, tempo, compileResult, activePhasers, sequencerMode, setSequencerMode } = useUiStore();

  const handlePlay = async () => {
    if (isPlaying) {
      await engine.stop();
    } else {
      await engine.play();
    }
  };

  const handleStop = async () => {
    await engine.stop();
    await engine.resetBeat();
    useUiStore.getState().setGlobalBeat(0);
  };

  const handleTempoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTempo = parseInt(e.target.value, 10);
    await engine.setTempo(newTempo);
    useUiStore.getState().setTempo(newTempo);
  };

  const handleModeChange = async (mode: SequencerMode) => {
    try {
      if (mode !== sequencerMode) {
        await engine.stop();
        await engine.resetBeat();
        useUiStore.getState().setGlobalBeat(0);
        useUiStore.getState().setActivePhasers([]); // Explicitly clear UI state
      }
      await engine.setSequencerMode(mode);
      setSequencerMode(mode);
    } catch (e) {
      console.error("Failed to change sequencer mode", e);
    }
  };

  const handlePhaserToggle = async (name: string, multiplier: number = 1.0) => {
    if (!isPlaying) {
      await engine.play();
      useUiStore.getState().setIsPlaying(true);
    }
    
    if (sequencerMode !== 'live') {
      await handleModeChange('live');
    }
    
    const activePhaser = activePhasers.find(p => p.name === name);
    
    if (activePhaser) {
      if (activePhaser.multiplier === multiplier) {
        await engine.stopPhaser(name);
      } else {
        await engine.triggerPhaser(name, multiplier);
      }
    } else {
      await engine.triggerPhaser(name, multiplier);
    }
  };

  const currentBeatInBar = Math.floor(useUiStore(state => state.globalBeat)) % 4;

  return (
    <div className={cn("flex flex-col w-64 border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-xl z-10 shrink-0")}>
      
      {/* Header */}
      <div className={cn("h-10 border-b border-zinc-800 bg-zinc-900/80 flex items-center px-4 justify-between backdrop-blur-md shrink-0")}>
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold text-zinc-200 tracking-wide">CONTROL</span>
        </div>
      </div>

      <div className="p-3 flex flex-col flex-1 overflow-y-auto custom-scrollbar">
        {/* Mode Switcher */}
        <div className={cn("flex bg-zinc-900 rounded p-1 border border-zinc-800/80 mb-3 shadow-inner")}>
          <Button 
            variant="ghost"
            onClick={() => handleModeChange('live')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-bold tracking-wider rounded-sm transition-all h-auto",
              sequencerMode === 'live' 
                ? "bg-zinc-800 text-white shadow-sm hover:bg-zinc-800 hover:text-white" 
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <Activity size={12} />
            LIVE PAD
          </Button>
          <Button 
            variant="ghost"
            onClick={() => handleModeChange('timeline')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-bold tracking-wider rounded-sm transition-all h-auto",
              sequencerMode === 'timeline' 
                ? "bg-zinc-800 text-white shadow-sm hover:bg-zinc-800 hover:text-white" 
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <Clock size={12} />
            TIMELINE
          </Button>
        </div>

        {/* Transport Controls */}
        <div className="flex gap-1.5 mb-3">
          <Button 
            variant="default"
            onClick={handlePlay} 
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-[11px] font-bold tracking-wider transition-all h-auto",
              isPlaying 
                ? "bg-zinc-800 text-amber-400 hover:bg-zinc-700 hover:text-amber-300 shadow-inner" 
                : "bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-600/20"
            )}
          >
            {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
            {isPlaying ? "PAUSE" : "PLAY"}
          </Button>
          
          <Button 
            variant="outline"
            onClick={handleStop}
            className={cn(
              "flex items-center justify-center px-3 py-2 rounded transition-all h-auto",
              "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border-zinc-800"
            )}
            title="Stop and Return to Start"
          >
            <Square size={12} fill="currentColor" />
          </Button>
        </div>

        {/* Beat Indicators */}
        <div className={cn("flex justify-evenly px-3 mb-3 bg-zinc-900/50 py-2 rounded border border-zinc-800/50")}>
          {[0, 1, 2, 3].map((b) => (
            <div 
              key={b} 
              className={cn(
                "w-2.5 h-2.5 rounded-full transition-colors duration-75 shadow-inner",
                isPlaying && currentBeatInBar === b 
                  ? b === 0 ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : "bg-zinc-800"
              )}
            />
          ))}
        </div>

        {/* Tempo Control */}
        <div className="mb-3 bg-zinc-900/30 p-2.5 rounded border border-zinc-800/50">
          <div className="flex justify-between items-start mb-1">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Clock size={12} />
              <span className="text-[10px] font-bold tracking-widest uppercase">Tempo</span>
            </div>
            <span className={cn("text-[11px] font-mono text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-500/20")}>
              {tempo} BPM
            </span>
          </div>
          <input 
            type="range" 
            min="30" 
            max="300" 
            value={tempo} 
            onChange={handleTempoChange}
            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
          />
        </div>

        {/* Dynamic Panel Content Based on Mode */}
        {sequencerMode === 'live' && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-1.5 mb-2.5 text-zinc-500">
              <SlidersHorizontal size={12} />
              <span className="text-[10px] font-bold tracking-widest uppercase">Live Pads</span>
            </div>
            <div className={cn("grid grid-cols-2 gap-2")}>
              {compileResult?.phaser_names.map(name => {
                const activePhaser = activePhasers.find(p => p.name === name);
                const isActive = !!activePhaser;
                const currentMultiplier = activePhaser?.multiplier ?? 1.0;
                
                return (
                  <div key={name} className="flex flex-col gap-1">
                    <Button 
                      variant="outline"
                      onClick={() => handlePhaserToggle(name, currentMultiplier)}
                      className={cn(
                        "rounded-lg text-[11px] font-medium transition-all flex flex-col items-center justify-center gap-2 p-2 border",
                        isActive ? "h-14" : "h-20",
                        isActive 
                          ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.15)] hover:bg-indigo-500/30 hover:text-indigo-200" 
                          : "bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-300 hover:border-zinc-700"
                      )}
                    >
                      <div className={cn(
                        "w-2 h-2 rounded-full transition-all shrink-0",
                        isActive ? "bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" : "bg-zinc-800"
                      )} />
                      <span className="text-center leading-tight line-clamp-2 px-1 whitespace-normal wrap-break-word w-full">{name}</span>
                    </Button>
                    
                    {isActive && (
                      <div className="flex gap-1 h-5">
                        <Button
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); handlePhaserToggle(name, Math.max(0.125, currentMultiplier * 0.5)); }}
                          className={cn(
                            "flex-1 rounded text-[9px] font-bold px-0 transition-colors h-full min-h-0",
                            currentMultiplier < 1.0
                              ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50"
                              : "bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:bg-zinc-800"
                          )}
                        >
                          {currentMultiplier < 1.0 ? `${currentMultiplier}x` : '.5x'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); handlePhaserToggle(name, Math.min(8.0, currentMultiplier * 2)); }}
                          className={cn(
                            "flex-1 rounded text-[9px] font-bold px-0 transition-colors h-full min-h-0",
                            currentMultiplier > 1.0
                              ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50"
                              : "bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:bg-zinc-800"
                          )}
                        >
                          {currentMultiplier > 1.0 ? `${currentMultiplier}x` : '2x'}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {(!compileResult || compileResult.phaser_names.length === 0) && (
                <div className={cn("col-span-2 flex flex-col items-center justify-center h-20 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 gap-2 text-zinc-600")}>
                  <Square size={14} className="opacity-50" />
                  <span className="text-[10px] font-bold tracking-widest uppercase">Empty</span>
                </div>
              )}
            </div>
          </div>
        )}
        
        {sequencerMode === 'timeline' && (
          <div className={cn("flex-1 flex flex-col items-center justify-center opacity-50 border border-dashed border-zinc-800 rounded-lg bg-zinc-800/30 p-4 text-center")}>
            <Clock size={16} className="mb-2 text-zinc-400" />
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Timeline Active</p>
            <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">Sequencer control delegated to timeline panel.</p>
          </div>
        )}
      </div>
    </div>
  );
}
