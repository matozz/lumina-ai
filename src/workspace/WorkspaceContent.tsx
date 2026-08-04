import { FlaskConical, Layers2, Layers3, Lightbulb, RadioTower } from "lucide-react";
import { AuthoringTransportBar } from "@/authoring/AuthoringTransportBar";
import { CanvasView } from "@/canvas/CanvasView";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { exactAsset } from "@/document/projectModel";
import { projectSelectors, useProjectStore } from "@/stores/project";
import type { WorkspaceId } from "@/stores/workspace";
import { EffectLabPreview } from "./effect-lab/EffectLabPreview";
import { CuePreview } from "./cues/CuePreview";
import { CueTimelinePanel } from "./arrange/CueTimelinePanel";

export function WorkspaceContent({ workspace }: { workspace: WorkspaceId }) {
  if (workspace === "arrange") {
    return (
      <ResizablePanelGroup orientation="vertical" className="min-h-0">
        <ResizablePanel id="arrange-preview" defaultSize="43%" minSize="28%">
          <WorkspaceSurface workspace={workspace} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="arrange-timeline" defaultSize="57%" minSize="36%">
          <CueTimelinePanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  if (workspace === "effect-lab") return <EffectLabPreview />;
  if (workspace === "cues") return <CuePreview />;

  return <WorkspaceSurface workspace={workspace} />;
}

function WorkspaceSurface({ workspace }: { workspace: WorkspaceId }) {
  const bundle = useProjectStore(projectSelectors.bundle);
  const arrangementRef = useProjectStore(projectSelectors.selectedArrangementRef);
  const liveViewMode = useProjectStore(projectSelectors.liveViewMode);
  const arrangement = exactAsset(bundle.arrangements, arrangementRef);
  const meta = surfaceMeta(workspace, liveViewMode);
  const Icon = meta.icon;

  return (
    <section className="bg-background relative flex h-full min-h-0 flex-col">
      <div className="border-border bg-card/70 flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <Icon className="text-muted-foreground size-3.5" aria-hidden="true" />
        <span className="text-xs font-medium">{meta.title}</span>
        <span className="text-muted-foreground truncate text-[10px]">{meta.description}</span>
        <span className="text-muted-foreground ml-auto font-mono text-[10px] tabular-nums">
          {arrangement?.tempo_map.points.length ?? 0} tempo points · TimeSignatureMap
        </span>
      </div>
      {workspace === "arrange" && arrangement && (
        <AuthoringTransportBar
          scope="arrangement"
          reference={arrangementRef}
          arrangement={arrangement}
        />
      )}
      <div className="relative min-h-0 flex-1">
        <CanvasView
          frameSource={workspace === "live" && liveViewMode === "live" ? "live" : "preview"}
        />
      </div>
    </section>
  );
}

function surfaceMeta(workspace: WorkspaceId, liveViewMode: "live" | "rehearsal") {
  return {
    stage: {
      icon: Lightbulb,
      title: "Stage canvas",
      description: "Patch, arrange and group fixtures",
    },
    "effect-lab": {
      icon: FlaskConical,
      title: "Effect loop preview",
      description: "One bar · draft preview",
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
      title: liveViewMode === "live" ? "Live stage" : "Rehearsal stage",
      description:
        liveViewMode === "live"
          ? "Immutable Take Live snapshot"
          : "Explicit Draft or Published preview sink",
    },
  }[workspace];
}
