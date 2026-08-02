import { useEffect } from "react";
import { onStateChange } from "./bridge/events";
import { engineActions } from "./stores/engine";
import { WorkspaceShell } from "./workspace/WorkspaceShell";
import { useWorkspaceBootstrap } from "./workspace/useWorkspaceBootstrap";
import "./App.css";

function App() {
  useWorkspaceBootstrap();

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

  return <WorkspaceShell />;
}

export default App;
