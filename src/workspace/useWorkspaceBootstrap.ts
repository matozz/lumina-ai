import { useEffect, useRef } from "react";
import { engine } from "@/bridge/commands";
import { engineActions, useEngineStore } from "@/stores/engine";
import { workspaceActions } from "@/stores/workspace";
import { createStarterProject } from "./defaultProject";

export function useWorkspaceBootstrap() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const bootstrap = async () => {
      const engineState = useEngineStore.getState();
      const document = engineState.parsedDsl ?? createStarterProject();
      if (!engineState.parsedDsl) {
        engineActions.loadCurrentDslCode(JSON.stringify(document, null, 2));
      }
      engineActions.setCompileStatus("compiling");

      try {
        const result = await engine.loadDSL(JSON.stringify(document));
        engineActions.setCompileResult(result);
        engineActions.setCompileErrors(result.errors);
        engineActions.setCompileStatus(result.success ? "success" : "error");
        workspaceActions.setSnapshotState({
          published_revision: result.show_revision,
          live_revision: result.show_revision,
        });
        if (result.success) {
          const catalog = await engine.getLiveEffects();
          engineActions.setLiveEffectCatalog(catalog);
          window.dispatchEvent(new CustomEvent("engine:layout-ready"));
        }
      } catch (error) {
        engineActions.setCompileStatus("error");
        workspaceActions.setPublishStatus(
          "error",
          error instanceof Error ? error.message : "Could not open the starter project.",
        );
      }
    };

    void bootstrap();
  }, []);
}
