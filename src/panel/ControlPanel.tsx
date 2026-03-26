import { useUiStore, SequencerMode } from "../stores/uiStore";
import { engine } from "../bridge/commands";
import { Play, Pause, Square, Activity, Clock, Settings2, SlidersHorizontal } from "lucide-react";
import { cn } from "../utils/cn";

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
      }
      await engine.setSequencerMode(mode);
      setSequencerMode(mode);
    } catch (e) {
      console.error("Failed to change sequencer mode", e);
    }
  };

  const handlePhaserToggle = async (name: string) => {
    if (!isPlaying) {
      await engine.play();
      useUiStore.getState().setIsPlaying(true);
    }
    
    if (sequencerMode !== 'live') {
      await handleModeChange('live');
    }
    
    if (activePhasers.includes(name)) {
      await engine.stopPhaser(name);
    } else {
      await engine.triggerPhaser(name);
    }
  };

  const currentBeatInBar = Math.floor(useUiStore(state => state.globalBeat)) % 4;

  return (
    <div className={cn("flex flex-col w-64 border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-xl z-10 shrink-0")}>
      
      {/* Header */}
      <div className={cn("h-9 border-b border-zinc-800 bg-zinc-900/80 flex items-center px-4 justify-between backdrop-blur-md shrink-0")}>
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-zinc-400" />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">CONTROL</span>
        </div>
      </div>

      <div className="p-3 flex flex-col flex-1 overflow-y-auto custom-scrollbar">
        {/* Mode Switcher */}
        <div className={cn("flex bg-zinc-900 rounded p-1 border border-zinc-800/80 mb-4 shadow-inner")}>
          <button 
            onClick={() => handleModeChange('live')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-bold tracking-wider rounded-sm transition-all",
              sequencerMode === 'live' 
                ? "bg-zinc-800 text-white shadow-sm" 
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <Activity size={12} />
            LIVE PAD
          </button>
          <button 
            onClick={() => handleModeChange('timeline')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-bold tracking-wider rounded-sm transition-all",
              sequencerMode === 'timeline' 
                ? "bg-zinc-800 text-white shadow-sm" 
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <Clock size={12} />
            TIMELINE
          </button>
        </div>

        {/* Transport Controls */}
        <div className="flex gap-1.5 mb-3">
          <button 
            onClick={handlePlay} 
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-[11px] font-bold tracking-wider transition-all",
              isPlaying 
                ? "bg-zinc-800 text-amber-400 hover:bg-zinc-700 hover:text-amber-300 border border-zinc-700 shadow-inner" 
                : "bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-600/20"
            )}
          >
            {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
            {isPlaying ? "PAUSE" : "PLAY"}
          </button>
          
          <button 
            onClick={handleStop}
            className={cn(
              "flex items-center justify-center px-3 py-2 rounded transition-all",
              "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800"
            )}
            title="Stop and Return to Start"
          >
            <Square size={12} fill="currentColor" />
          </button>
        </div>

        {/* Beat Indicators */}
        <div className={cn("flex justify-between px-3 mb-5 bg-zinc-900/50 py-2 rounded border border-zinc-800/50")}>
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
        <div className="mb-5 bg-zinc-900/30 p-2.5 rounded border border-zinc-800/50">
          <div className="flex justify-between items-center mb-2.5">
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
            <div className={cn("grid grid-cols-2 gap-1.5")}>
              {compileResult?.phaser_names.map(name => {
                const isActive = activePhasers.includes(name);
                return (
                  <button 
                    key={name}
                    onClick={() => handlePhaserToggle(name)}
                    className={cn(
                      "aspect-square rounded-lg text-[11px] font-medium transition-all flex flex-col items-center justify-center gap-2 p-1.5 border",
                      isActive 
                        ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.15)]" 
                        : "bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-300 hover:border-zinc-700"
                    )}
                  >
                    <div className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      isActive ? "bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" : "bg-zinc-800"
                    )} />
                    <span className="text-center leading-tight line-clamp-2 px-1">{name}</span>
                  </button>
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
          <div className={cn("flex-1 flex flex-col items-center justify-center opacity-50 border border-dashed border-zinc-800 rounded-lg bg-zinc-900/30 p-4 text-center mt-2")}>
            <Clock size={16} className="mb-2 text-zinc-500" />
            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Timeline Active</p>
            <p className="text-[10px] text-zinc-600 mt-1.5 leading-relaxed">Sequencer control delegated to timeline panel.</p>
          </div>
        )}
      </div>
    </div>
  );
}
