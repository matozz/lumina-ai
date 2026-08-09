import { FlaskConical, Layers2, Layers3, Lightbulb, RadioTower, TriangleAlert } from "lucide-react";
import { AuthoringTransportBar } from "@/authoring/AuthoringTransportBar";
import { CanvasView } from "@/canvas/CanvasView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { exactAsset } from "@/document/projectModel";
import { cn } from "@/lib/utils";
import { projectSelectors, useProjectStore } from "@/stores/project";
import type { WorkspaceId } from "@/stores/workspace";
import { useWorkspaceStore, workspaceActions, workspaceSelectors } from "@/stores/workspace";
import { EffectLabPreview } from "./effect-lab/EffectLabPreview";
import { CuePreview } from "./cues/CuePreview";
import { ArrangementTimeline } from "./arrange/ArrangementTimeline";
import { WorkspacePanelHeader } from "./WorkspacePanelHeader";

export function WorkspaceContent({ workspace }: { workspace: WorkspaceId }) {
  const arrangeTimelineFocus = useWorkspaceStore(workspaceSelectors.arrangeTimelineFocus);
  const arrangePreviewSize = useWorkspaceStore(workspaceSelectors.arrangePreviewSize);
  if (workspace === "arrange") {
    if (arrangeTimelineFocus) {
      return (
        <div className="flex h-full min-h-0 flex-col" data-arrange-focus-mode>
          <WorkspaceSurface workspace={workspace} compact />
          <div className="min-h-0 flex-1">
            <ArrangementTimeline />
          </div>
        </div>
      );
    }
    return (
      <ResizablePanelGroup
        id="arrange-editor-split"
        orientation="vertical"
        className="min-h-0"
        defaultLayout={{
          "arrange-preview": arrangePreviewSize,
          "arrange-timeline": 100 - arrangePreviewSize,
        }}
        onLayoutChanged={(layout, meta) => {
          if (meta.isUserInteraction && layout["arrange-preview"] !== undefined) {
            workspaceActions.setArrangePreviewSize(layout["arrange-preview"]);
          }
        }}
      >
        <ResizablePanel id="arrange-preview" defaultSize={`${arrangePreviewSize}%`} minSize="10rem">
          <WorkspaceSurface workspace={workspace} />
        </ResizablePanel>
        <ResizableHandle
          withHandle
          onKeyDownCapture={(event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              (event.key === "ArrowUp" || event.key === "ArrowDown")
            ) {
              event.preventDefault();
            }
          }}
        />
        <ResizablePanel
          id="arrange-timeline"
          defaultSize={`${100 - arrangePreviewSize}%`}
          minSize="12rem"
        >
          <ArrangementTimeline />
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  if (workspace === "effect-lab") return <EffectLabPreview />;
  if (workspace === "cues") return <CuePreview />;

  return <WorkspaceSurface workspace={workspace} />;
}

function WorkspaceSurface({
  workspace,
  compact = false,
}: {
  workspace: WorkspaceId;
  compact?: boolean;
}) {
  const bundle = useProjectStore(projectSelectors.bundle);
  const arrangementRef = useProjectStore(projectSelectors.selectedArrangementRef);
  const previewError = useProjectStore(projectSelectors.previewError);
  const arrangement = exactAsset(bundle.arrangements, arrangementRef);
  const meta = surfaceMeta(workspace);
  const Icon = meta.icon;

  return (
    <section
      className={cn(
        "bg-background relative flex min-h-0 flex-col",
        compact ? "shrink-0" : "h-full",
      )}
      data-arrange-preview-compact={compact || undefined}
    >
      <WorkspacePanelHeader icon={Icon} title={meta.title}>
        <span className="text-muted-foreground min-w-0 truncate text-[10px]">
          {meta.description}
        </span>
        <span className="text-muted-foreground ml-auto font-mono text-[10px] tabular-nums">
          {arrangement?.tempo_map.points.length ?? 0} tempo points · TimeSignatureMap
        </span>
      </WorkspacePanelHeader>
      {workspace === "arrange" && arrangement && (
        <AuthoringTransportBar
          scope="arrangement"
          reference={arrangementRef}
          arrangement={arrangement}
        />
      )}
      {!compact && (
        <div className="relative min-h-0 flex-1">
          <CanvasView
            frameSource={workspace === "live" ? "live" : "preview"}
            showIntensityWithoutColor={workspace === "arrange"}
            layoutOnly={workspace === "stage"}
          />
          {workspace === "arrange" && previewError && (
            <div className="bg-background/80 absolute inset-0 flex items-center justify-center p-6 backdrop-blur-sm">
              <Alert variant="destructive" className="max-w-md">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Arrangement preview unavailable</AlertTitle>
                <AlertDescription>{previewError}</AlertDescription>
              </Alert>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function surfaceMeta(workspace: WorkspaceId) {
  return {
    stage: {
      icon: Lightbulb,
      title: "Stage canvas",
      description: "Patch, arrange and group fixtures",
    },
    "effect-lab": {
      icon: FlaskConical,
      title: "Effect loop preview",
      description: "One-bar effect preview",
    },
    cues: {
      icon: Layers2,
      title: "Cue canvas",
      description: "Layered Effects bound to deterministic TargetSets",
    },
    arrange: {
      icon: Layers3,
      title: "Arrangement canvas",
      description: "Canvas and lighting tracks share one tempo-driven timeline",
    },
    live: {
      icon: RadioTower,
      title: "Live stage",
      description: "Output from the current Arrangement",
    },
  }[workspace];
}
