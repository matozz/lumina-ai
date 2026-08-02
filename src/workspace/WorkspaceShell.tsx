import { DslEditor } from "@/editor/DslEditor";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { engine } from "@/bridge/commands";
import { engineActions } from "@/stores/engine";
import {
  type WorkspaceId,
  useWorkspaceStore,
  workspaceActions,
  workspaceSelectors,
} from "@/stores/workspace";
import { WorkspaceContent } from "./WorkspaceContent";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceInspector } from "./WorkspaceInspector";
import { WorkspaceLibrary } from "./WorkspaceLibrary";
import { WorkspaceRail } from "./WorkspaceRail";

export function WorkspaceShell() {
  const activeWorkspace = useWorkspaceStore(workspaceSelectors.activeWorkspace);
  const advancedMode = useWorkspaceStore(workspaceSelectors.advancedMode);
  const libraryVisible = useWorkspaceStore(workspaceSelectors.libraryVisible);
  const inspectorVisible = useWorkspaceStore(workspaceSelectors.inspectorVisible);
  const showContextLibrary = libraryVisible && activeWorkspace !== "arrange";

  const selectWorkspace = async (workspace: WorkspaceId) => {
    workspaceActions.setActiveWorkspace(workspace);
    const mode = workspace === "arrange" ? "timeline" : "live";
    try {
      await engine.setSequencerMode(mode);
      engineActions.setSequencerMode(mode);
    } catch (error) {
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : "Workspace mode could not be changed.",
      );
    }
  };

  return (
    <div
      className={cn(
        "bg-background text-foreground relative flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden",
      )}
      data-layout-root
    >
      <WorkspaceHeader />
      <div className="flex min-h-0 min-w-0 flex-1">
        <WorkspaceRail
          activeWorkspace={activeWorkspace}
          onSelect={(id) => void selectWorkspace(id)}
        />
        <ResizablePanelGroup orientation="horizontal" className="min-w-0">
          {showContextLibrary && (
            <>
              <ResizablePanel id="context-library" defaultSize="17%" minSize="12rem" maxSize="24%">
                <WorkspaceLibrary workspace={activeWorkspace} />
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}

          <ResizablePanel id="main-workspace" defaultSize="61%" minSize="34rem">
            <main className="h-full min-h-0 min-w-0" data-layout-region="workspace">
              {advancedMode ? (
                <DslEditor embedded />
              ) : (
                <WorkspaceContent workspace={activeWorkspace} />
              )}
            </main>
          </ResizablePanel>

          {inspectorVisible && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="context-inspector"
                defaultSize="22%"
                minSize="13rem"
                maxSize="28%"
              >
                <WorkspaceInspector workspace={activeWorkspace} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
