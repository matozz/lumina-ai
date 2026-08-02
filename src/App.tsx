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
      engineActions.applyRuntimeState(state);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return <WorkspaceShell />;
}

export default App;
