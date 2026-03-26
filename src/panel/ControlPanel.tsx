import { useUiStore, SequencerMode } from "../stores/uiStore";
import { engine } from "../bridge/commands";
import { Play, Pause, Square, Activity, Clock } from "lucide-react";
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
    <div className={cn("flex flex-col w-72 border-l border-zinc-800 bg-zinc-950 p-5 text-zinc-100 shadow-xl z-10")}>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-semibold tracking-tight">Control Panel</h3>
      </div>
      
      {/* Mode Switcher */}
      <div className={cn("flex bg-zinc-900 rounded-lg p-1 border border-zinc-800 mb-6")}>
        <button 
          onClick={() => handleModeChange('live')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-all",
            sequencerMode === 'live' 
              ? "bg-zinc-800 text-white shadow-sm" 
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
          )}
        >
          <Activity size={14} />
          Live Pad
        </button>
        <button 
          onClick={() => handleModeChange('timeline')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-all",
            sequencerMode === 'timeline' 
              ? "bg-zinc-800 text-white shadow-sm" 
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
          )}
        >
          <Clock size={14} />
          Timeline
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        <button 
          onClick={handlePlay} 
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md text-sm font-medium transition-all",
            isPlaying 
              ? "bg-zinc-800 text-amber-400 hover:bg-zinc-700 hover:text-amber-300 border-zinc-700 shadow-inner" 
              : "bg-emerald-500 text-white hover:bg-emerald-400 shadow-sm shadow-emerald-500/20"
          )}
        >
          {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          {isPlaying ? "Pause" : "Play"}
        </button>
        
        <button 
          onClick={handleStop}
          className={cn(
            "flex items-center justify-center px-4 py-3 rounded-md transition-all",
            "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800"
          )}
          title="Stop and Return to Start"
        >
          <Square size={16} fill="currentColor" />
        </button>
      </div>

      <div className={cn("flex justify-between px-2 mb-8 bg-zinc-900/50 py-3 rounded-md border border-zinc-800/50")}>
        {[0, 1, 2, 3].map((b) => (
          <div 
            key={b} 
            className={cn(
              "w-3 h-3 rounded-full transition-colors duration-75 shadow-inner",
              isPlaying && currentBeatInBar === b 
                ? b === 0 ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                : "bg-zinc-800"
            )}
          />
        ))}
      </div>

      <div className="mb-8">
        <div className="flex justify-between items-center mb-3">
          <label className="text-sm font-medium text-zinc-400">Master Tempo</label>
          <span className={cn("text-sm font-mono text-zinc-100 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800")}>
            {tempo} BPM
          </span>
        </div>
        <input 
          type="range" 
          min="30" 
          max="300" 
          value={tempo} 
          onChange={handleTempoChange}
          className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />
      </div>

      {sequencerMode === 'live' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <h4 className={cn("text-xs font-semibold text-zinc-400 mb-3 uppercase tracking-wider")}>Live Pads</h4>
          <div className={cn("grid grid-cols-2 gap-2 overflow-y-auto custom-scrollbar pb-4")}>
            {compileResult?.phaser_names.map(name => {
              const isActive = activePhasers.includes(name);
              return (
                <button 
                  key={name}
                  onClick={() => handlePhaserToggle(name)}
                  className={cn(
                    "aspect-square rounded-xl text-xs font-medium transition-all flex flex-col items-center justify-center gap-3 p-2 border-2",
                    isActive 
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]" 
                      : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
                  )}
                >
                  <div className={cn(
                    "w-3 h-3 rounded-full transition-all",
                    isActive ? "bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" : "bg-zinc-800"
                  )} />
                  <span className="text-center leading-tight line-clamp-2">{name}</span>
                </button>
              );
            })}
            {(!compileResult || compileResult.phaser_names.length === 0) && (
              <div className={cn("col-span-2 flex items-center justify-center h-24 rounded-xl border-2 border-dashed border-zinc-800 bg-zinc-900/50")}>
                <span className="text-sm text-zinc-500">No phasers compiled</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {sequencerMode === 'timeline' && (
        <div className={cn("flex-1 flex flex-col items-center justify-center opacity-50 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-900/30 p-6 text-center")}>
          <Clock size={24} className="mb-3 text-zinc-500" />
          <p className="text-sm font-medium text-zinc-400">Timeline Mode Active</p>
          <p className="text-xs text-zinc-500 mt-2">Use the bottom panel to arrange and edit sequences.</p>
        </div>
      )}
    </div>
  );
}
