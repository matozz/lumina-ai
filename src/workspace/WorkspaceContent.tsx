import { AudioLines, FlaskConical, Lightbulb, RadioTower } from "lucide-react";
import { CanvasView } from "@/canvas/CanvasView";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TimelinePanel } from "@/panel/TimelinePanel";
import { engineSelectors, useEngineStore } from "@/stores/engine";
import type { WorkspaceId } from "@/stores/workspace";

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

  if (workspace === "song") return <SongPlaceholder />;

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

function SongPlaceholder() {
  return (
    <section className="bg-background flex h-full min-h-0 p-3">
      <Empty className="bg-card/40 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AudioLines aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Build the show around a song</EmptyTitle>
          <EmptyDescription>
            Audio import, cached waveform peaks and manual beat-grid correction are implemented in
            Stage 7 after this workspace shell is stable.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <span className="text-muted-foreground text-xs">No audio asset attached</span>
        </EmptyContent>
      </Empty>
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
    song: { icon: AudioLines, title: "Song", description: "Waveform and beat grid" },
    arrange: {
      icon: AudioLines,
      title: "Song spine",
      description: "Canvas and lighting arrangement share one timeline",
    },
    live: {
      icon: RadioTower,
      title: "Rehearsal stage",
      description: "Published Live Snapshot",
    },
  }[workspace];
}
