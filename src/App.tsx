import { useEffect } from "react";
import { CanvasView } from "./canvas/CanvasView";
import { ControlPanel } from "./panel/ControlPanel";
import { DslEditor } from "./editor/DslEditor";
import { TimelineView } from "./panel/TimelineView";
import { onStateChange } from "./bridge/events";
import { useUiStore } from "./stores/uiStore";
import "./App.css";

function App() {
  const { setIsPlaying, setTempo, setGlobalBeat, setActivePhasers, sequencerMode } = useUiStore();

  useEffect(() => {
    const unlisten = onStateChange((state) => {
      setIsPlaying(state.is_playing);
      setTempo(state.tempo);
      setGlobalBeat(state.global_beat);
      setActivePhasers(state.active_phasers);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [setIsPlaying, setTempo, setGlobalBeat, setActivePhasers]);

  return (
    <div className="flex flex-col w-screen h-screen bg-black overflow-hidden font-sans text-zinc-50 relative">
      <div className="flex flex-1 overflow-hidden">
        <DslEditor />
        <div className="flex-1 flex flex-col relative z-0">
          <CanvasView />
        </div>
        <ControlPanel />
      </div>
      {sequencerMode === 'timeline' && <TimelineView />}
    </div>
  );
}

export default App;
