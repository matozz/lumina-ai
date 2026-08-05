import { FlaskConical, RadioTower } from "lucide-react";
import { AuthoringTransportBar } from "@/authoring/AuthoringTransportBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { exactAsset } from "@/document/projectModel";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { useWorkspaceStore, workspaceSelectors } from "@/stores/workspace";
import { LiveControlPanel } from "./LiveControlPanel";

export function LiveRehearsalInspector() {
  const viewMode = useProjectStore(projectSelectors.liveViewMode);
  const previewSource = useProjectStore(projectSelectors.previewSource);
  const publishedRevision = useWorkspaceStore(workspaceSelectors.publishedRevision);
  const liveRevision = useWorkspaceStore(workspaceSelectors.liveRevision);

  return (
    <div className="bg-card flex h-full min-h-0 flex-col" aria-label="Live and rehearsal boundary">
      <div className="border-border flex shrink-0 flex-col gap-2 border-b p-2.5">
        <div className="flex items-center gap-2">
          {viewMode === "live" ? (
            <RadioTower className="text-primary" aria-hidden="true" />
          ) : (
            <FlaskConical className="text-primary" aria-hidden="true" />
          )}
          <span className="text-xs font-medium">Output source</span>
          <Badge variant={viewMode === "live" ? "destructive" : "secondary"} className="ml-auto">
            {viewMode === "live" ? (liveRevision === null ? "Not live" : "Live") : "Rehearsal"}
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <Button
            size="xs"
            variant={viewMode === "live" ? "default" : "outline"}
            onClick={() => projectActions.setLiveViewMode("live")}
          >
            Live
          </Button>
          <Button
            size="xs"
            variant={
              viewMode === "rehearsal" && previewSource === "rehearsal_draft"
                ? "secondary"
                : "outline"
            }
            onClick={() => {
              projectActions.setPreviewSource("rehearsal_draft");
              projectActions.setLiveViewMode("rehearsal");
            }}
          >
            Draft
          </Button>
          <Button
            size="xs"
            variant={
              viewMode === "rehearsal" && previewSource === "rehearsal_published"
                ? "secondary"
                : "outline"
            }
            disabled={publishedRevision === null}
            onClick={() => {
              if (publishedRevision === null) return;
              projectActions.setPreviewSource("rehearsal_published", publishedRevision);
              projectActions.setLiveViewMode("rehearsal");
            }}
          >
            Published
          </Button>
        </div>
        <p className="text-muted-foreground text-[10px] leading-relaxed">
          Rehearsal renders through a preview sink. Live reads only the immutable snapshot created
          by explicit Take live.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        {viewMode === "live" ? <LiveControlPanel embedded /> : <RehearsalControls />}
      </div>
    </div>
  );
}

function RehearsalControls() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const reference = useProjectStore(projectSelectors.selectedArrangementRef);
  const arrangement = exactAsset(bundle.arrangements, reference);
  if (!arrangement) return null;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3" aria-label="Isolated rehearsal controls">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium">{arrangement.name}</span>
          <Badge variant="outline">{arrangement.tempo_map.points.length} tempo points</Badge>
        </div>
        <AuthoringTransportBar
          scope="arrangement"
          reference={reference}
          arrangement={arrangement}
          className="rounded-md border"
        />
        <p className="text-muted-foreground text-[10px] leading-relaxed">
          Seek and loop stay inside PreviewSession and never mutate Live transport.
        </p>
      </div>
    </ScrollArea>
  );
}
