import { FlaskConical, Layers3, Lightbulb, RadioTower } from "lucide-react";
import { CanvasView } from "@/canvas/CanvasView";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TimelinePanel } from "@/panel/TimelinePanel";
import { engineSelectors, useEngineStore } from "@/stores/engine";
import type { WorkspaceId } from "@/stores/workspace";
import { EffectLabPreview } from "./effect-lab/EffectLabPreview";

export function WorkspaceContent({ workspace }: { workspace: WorkspaceId }) {
  if (workspace === "arrange") {
    return (
      <ResizablePanelGroup orientation="vertical" className="min-h-0">
        <ResizablePanel id="arrange-preview" defaultSize="43%" minSize="28%">
          <WorkspaceSurface workspace={workspace} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="arrange-timeline" defaultSize="57%" minSize="36%">
          <TimelinePanel embedded />
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  if (workspace === "effect-lab") return <EffectLabPreview />;

  return <WorkspaceSurface workspace={workspace} />;
}

function WorkspaceSurface({ workspace }: { workspace: WorkspaceId }) {
  const document = useEngineStore(engineSelectors.parsedDsl);
  const meta = surfaceMeta(workspace);
  const Icon = meta.icon;

  return (
    <section className="bg-background relative flex h-full min-h-0 flex-col">
      <div className="border-border bg-card/70 flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <Icon className="text-muted-foreground size-3.5" aria-hidden="true" />
        <span className="text-xs font-medium">{meta.title}</span>
        <span className="text-muted-foreground truncate text-[10px]">{meta.description}</span>
        <span className="text-muted-foreground ml-auto font-mono text-[10px] tabular-nums">
          {document?.timeline?.tempo_map.points[0]?.bpm ?? 120} BPM · 4/4
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <CanvasView />
      </div>
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
      description: "One bar · draft preview",
    },
    arrange: {
      icon: Layers3,
      title: "Arrangement canvas",
      description: "Canvas and lighting tracks share one fixed-BPM timeline",
    },
    live: {
      icon: RadioTower,
      title: "Rehearsal stage",
      description: "Published Live Snapshot",
    },
  }[workspace];
}
