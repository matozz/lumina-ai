import {
  FileCode2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RadioTower,
  Upload,
} from "lucide-react";
import { engine } from "@/bridge/commands";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { engineActions, engineSelectors, useEngineStore } from "@/stores/engine";
import { useWorkspaceStore, workspaceActions, workspaceSelectors } from "@/stores/workspace";

export function WorkspaceHeader() {
  const document = useEngineStore(engineSelectors.parsedDsl);
  const isDirty = useEngineStore(engineSelectors.isDocumentDirty);
  const compileStatus = useEngineStore(engineSelectors.compileStatus);
  const advancedMode = useWorkspaceStore(workspaceSelectors.advancedMode);
  const libraryVisible = useWorkspaceStore(workspaceSelectors.libraryVisible);
  const inspectorVisible = useWorkspaceStore(workspaceSelectors.inspectorVisible);
  const publishedRevision = useWorkspaceStore(workspaceSelectors.publishedRevision);
  const liveRevision = useWorkspaceStore(workspaceSelectors.liveRevision);
  const publishStatus = useWorkspaceStore(workspaceSelectors.publishStatus);
  const statusMessage = useWorkspaceStore(workspaceSelectors.statusMessage);
  const busy = publishStatus === "publishing" || publishStatus === "activating";

  const publishDraft = async () => {
    if (!document || busy) return;
    workspaceActions.setPublishStatus("publishing", "Publishing validated revision…");
    engineActions.setCompileStatus("compiling");
    try {
      const result = await engine.publishDSL(JSON.stringify(document));
      engineActions.setCompileResult(result);
      engineActions.setCompileErrors(result.errors);
      engineActions.setCompileStatus(result.success ? "success" : "error");
      if (!result.success || result.show_revision === null) {
        workspaceActions.setPublishStatus("error", "Draft has errors. Fix them before publishing.");
        return;
      }
      workspaceActions.setPublishedRevision(result.show_revision);
      workspaceActions.setPublishStatus("idle", `Published revision ${result.show_revision}.`);
    } catch (error) {
      engineActions.setCompileStatus("error");
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : "Draft could not be published.",
      );
    }
  };

  const takeLive = async () => {
    if (publishedRevision === null || publishedRevision === liveRevision || busy) return;
    workspaceActions.setPublishStatus("activating", "Taking published revision live…");
    try {
      const snapshot = await engine.activateShowRevision(publishedRevision);
      workspaceActions.setSnapshotState(snapshot);
      workspaceActions.setPublishStatus("idle", `Live is now revision ${snapshot.live_revision}.`);
      window.dispatchEvent(new CustomEvent("engine:layout-ready"));
    } catch (error) {
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : "Published revision could not go live.",
      );
    }
  };

  return (
    <header
      className={cn("border-border bg-card flex h-11 shrink-0 items-center gap-2 border-b px-2.5")}
      data-layout-region="workspace-header"
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
          <RadioTower className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{document?.meta.name ?? "Lumina"}</p>
          <p className="text-muted-foreground truncate text-[10px]">DJ lighting workspace</p>
        </div>
      </div>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <div className="flex min-w-0 items-center gap-1.5" aria-label="Show revision state">
        <Badge variant={isDirty ? "outline" : "secondary"}>Draft{isDirty ? " • edited" : ""}</Badge>
        <Badge variant="outline">Published {formatRevision(publishedRevision)}</Badge>
        <Badge variant={publishedRevision !== liveRevision ? "destructive" : "secondary"}>
          Live {formatRevision(liveRevision)}
        </Badge>
        {statusMessage && (
          <span className="text-muted-foreground hidden max-w-52 truncate text-xs xl:inline">
            {statusMessage}
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={!document || busy || compileStatus === "compiling"}
          onClick={() => void publishDraft()}
        >
          <Upload data-icon="inline-start" aria-hidden="true" />
          {publishStatus === "publishing" ? "Publishing" : "Publish"}
        </Button>
        <Button
          variant={publishedRevision !== liveRevision ? "default" : "secondary"}
          size="sm"
          disabled={publishedRevision === null || publishedRevision === liveRevision || busy}
          onClick={() => void takeLive()}
        >
          <RadioTower data-icon="inline-start" aria-hidden="true" />
          {publishStatus === "activating" ? "Taking live" : "Take live"}
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

function formatRevision(revision: number | null) {
  return revision === null ? "—" : `r${revision}`;
}
