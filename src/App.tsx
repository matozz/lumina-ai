import { useEffect } from "react";
import { CanvasView } from "./canvas/CanvasView";
import { ControlPanel } from "@/panel/components/control/ControlPanel";
import { DslEditor } from "./editor/DslEditor";
import { TimelineView } from "./panel/TimelineView";
import { onStateChange } from "./bridge/events";
import { useEngineStore, engineActions, engineSelectors } from "./stores/engine";
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
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-black font-sans text-zinc-50">
      <div className="flex flex-1 overflow-hidden">
        <DslEditor />
        <div className="relative z-0 flex flex-1 flex-col">
          <CanvasView />
        </div>
        <ControlPanel />
      </div>
      {sequencerMode === "timeline" && <TimelineView />}
    </div>
  );
}

export default App;
