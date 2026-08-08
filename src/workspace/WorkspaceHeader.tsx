import {
  FileCode2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RadioTower,
  RotateCcw,
} from "lucide-react";
import { engine } from "@/bridge/commands";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { authoringDraftActions } from "@/stores/authoringDraft";
import { engineActions, engineSelectors, useEngineStore } from "@/stores/engine";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { useWorkspaceStore, workspaceActions, workspaceSelectors } from "@/stores/workspace";
import { useState } from "react";

export function WorkspaceHeader() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const arrangementRef = useProjectStore(projectSelectors.selectedArrangementRef);
  const compileStatus = useEngineStore(engineSelectors.compileStatus);
  const advancedMode = useWorkspaceStore(workspaceSelectors.advancedMode);
  const libraryVisible = useWorkspaceStore(workspaceSelectors.libraryVisible);
  const inspectorVisible = useWorkspaceStore(workspaceSelectors.inspectorVisible);
  const publishStatus = useWorkspaceStore(workspaceSelectors.publishStatus);
  const statusMessage = useWorkspaceStore(workspaceSelectors.statusMessage);
  const [resetOpen, setResetOpen] = useState(false);
  const busy = publishStatus === "publishing" || publishStatus === "activating";

  const goLive = async () => {
    if (busy) return;
    workspaceActions.setPublishStatus("publishing", "Preparing the current Arrangement…");
    engineActions.setCompileStatus("compiling");
    try {
      const result = await engine.publishProject(bundle, arrangementRef);
      engineActions.setCompileErrors(result.errors);
      engineActions.setCompileStatus(result.success ? "success" : "error");
      if (!result.success || result.show_revision === null) {
        workspaceActions.setPublishStatus("error", "This Arrangement has errors. Fix them first.");
        return;
      }
      projectActions.markPublished();
      workspaceActions.setPublishedRevision(result.show_revision);
      workspaceActions.setPublishStatus("activating", "Starting live output…");
      const snapshot = await engine.activateShowRevision(result.show_revision);
      workspaceActions.setSnapshotState(snapshot);
      const catalog = await engine.getLiveEffects();
      engineActions.setLiveEffectCatalog(catalog);
      workspaceActions.setPublishStatus("idle", "The current Arrangement is live.");
      window.dispatchEvent(new CustomEvent("engine:layout-ready"));
    } catch (error) {
      engineActions.setCompileStatus("error");
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : "The current Arrangement could not go live.",
      );
    }
  };

  const resetDefaults = () => {
    setResetOpen(false);
    projectActions.reset();
    authoringDraftActions.reset();
    engineActions.setCompileErrors([]);
    engineActions.setCompileStatus("idle");
    workspaceActions.resetAuthoringDefaults();
  };

  return (
    <>
      <header
        className={cn(
          "border-border bg-card flex h-11 shrink-0 items-center gap-2 border-b px-2.5",
        )}
        data-layout-region="workspace-header"
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
            <RadioTower className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{bundle.manifest.name}</p>
            <p className="text-muted-foreground truncate text-[10px]">
              Tempo-driven lighting workspace
            </p>
          </div>
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <div className="flex min-w-0 items-center" aria-live="polite">
          {statusMessage && (
            <span className="text-muted-foreground hidden max-w-80 truncate text-xs lg:inline">
              {statusMessage}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setResetOpen(true)}>
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            Reset
          </Button>
          <Button
            size="sm"
            disabled={busy || compileStatus === "compiling"}
            onClick={() => void goLive()}
          >
            <RadioTower data-icon="inline-start" aria-hidden="true" />
            {busy ? "Going live…" : "Live"}
          </Button>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Button
            variant={advancedMode ? "secondary" : "ghost"}
            size="sm"
            onClick={() => workspaceActions.setAdvancedMode(!advancedMode)}
            aria-pressed={advancedMode}
          >
            <FileCode2 data-icon="inline-start" aria-hidden="true" />
            Advanced
          </Button>
          <PanelToggle
            label={libraryVisible ? "Hide context library" : "Show context library"}
            onClick={() => workspaceActions.setLibraryVisible(!libraryVisible)}
            icon={libraryVisible ? PanelLeftClose : PanelLeftOpen}
          />
          <PanelToggle
            label={inspectorVisible ? "Hide inspector" : "Show inspector"}
            onClick={() => workspaceActions.setInspectorVisible(!inspectorVisible)}
            icon={inspectorVisible ? PanelRightClose : PanelRightOpen}
          />
        </div>
      </header>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore default configuration?</DialogTitle>
            <DialogDescription>
              This replaces locally saved Stages, Layouts, Effects, Cues, and Arrangements with the
              Lumina defaults. Current live output stays unchanged until you click Live.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={resetDefaults}>
              <RotateCcw data-icon="inline-start" aria-hidden="true" />
              Restore defaults
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PanelToggle({
  label,
  onClick,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  icon: typeof PanelLeftClose;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
            <Icon aria-hidden="true" />
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
