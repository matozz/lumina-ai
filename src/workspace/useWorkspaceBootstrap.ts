import { useEffect, useRef } from "react";
import { engine } from "@/bridge/commands";
import { engineActions } from "@/stores/engine";
import { workspaceActions } from "@/stores/workspace";

export function useWorkspaceBootstrap() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const bootstrap = async () => {
      engineActions.setCompileStatus("idle");
      try {
        const snapshot = await engine.getShowSnapshotState();
        workspaceActions.setSnapshotState(snapshot);
        if (snapshot.live_revision === null) return;
        const catalog = await engine.getLiveEffects();
        engineActions.setLiveEffectCatalog(catalog);
        window.dispatchEvent(new CustomEvent("engine:layout-ready"));
      } catch (error) {
        workspaceActions.setPublishStatus(
          "error",
          error instanceof Error ? error.message : "Could not restore the snapshot boundary.",
        );
      }
    };

    void bootstrap();
  }, []);
}
