import { useEffect } from "react";
import { CanvasView } from "./canvas/CanvasView";
import { DslEditor } from "./editor/DslEditor";
import { TimelinePanel } from "./panel/TimelinePanel";
import { ControlPanel } from "./panel/ControlPanel";
import { onStateChange } from "./bridge/events";
import { useEngineStore, engineActions, engineSelectors } from "./stores/engine";
import { cn } from "./lib/utils";
import "./App.css";

function App() {
  const sequencerMode = useEngineStore(engineSelectors.sequencerMode);

  useEffect(() => {
    const unlisten = onStateChange((state) => {
      engineActions.setTransport(state.transport_state, state.transport_revision);
      engineActions.setTempo(state.tempo);
      engineActions.setGlobalBeat(state.global_beat);
      engineActions.setActivePhasers(state.active_phasers);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div
      className={cn(
        "relative flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden bg-black font-sans text-zinc-50",
      )}
      data-layout-root
    >
      <div
        className={cn("flex min-h-0 min-w-0 flex-1 overflow-hidden")}
        data-layout-region="workspace"
      >
        <DslEditor />
        <div
          className={cn("relative z-0 flex min-h-0 min-w-0 flex-1 flex-col")}
          data-layout-region="canvas"
        >
          <CanvasView />
        </div>
        <ControlPanel />
      </div>
      {sequencerMode === "timeline" && <TimelinePanel />}
    </div>
  );
}

export default App;
