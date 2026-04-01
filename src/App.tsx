import { useEffect } from "react";
import { CanvasView } from "./canvas/CanvasView";
import { ControlPanel } from "./panel/ControlPanel";
import { DslEditor } from "./editor/DslEditor";
import { TimelineView } from "./panel/TimelineView";
import { onStateChange } from "./bridge/events";
import { useEngineStore, engineActions, engineSelectors } from "./stores/engineStore";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./App.css";

function App() {
  const sequencerMode = useEngineStore(engineSelectors.sequencerMode);

  useEffect(() => {
    const unlisten = onStateChange((state) => {
      engineActions.setIsPlaying(state.is_playing);
      engineActions.setTempo(state.tempo);
      engineActions.setGlobalBeat(state.global_beat);
      engineActions.setActivePhasers(state.active_phasers);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  return (
    <TooltipProvider delay={200}>
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
    </TooltipProvider>
  );
}

export default App;
