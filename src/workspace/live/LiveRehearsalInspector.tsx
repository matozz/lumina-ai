import { FlaskConical, RadioTower, RotateCcw, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { assetKey, exactAsset } from "@/document/projectModel";
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
            {viewMode === "live" ? `Live ${formatRevision(liveRevision)}` : "Rehearsal sink"}
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
  const sessions = useProjectStore((state) => state.arrangementSessions);
  const arrangement = exactAsset(bundle.arrangements, reference);
  if (!arrangement) return null;
  const session = sessions[assetKey(reference)] ?? {
    playheadTick: 0,
    loopEnabled: false,
    loopStartTick: 0,
    loopEndTick: Math.min(3_840, arrangement.length_ticks),
  };
  const seek = (tick: number) =>
    projectActions.setArrangementPlayhead(
      reference,
      Math.min(arrangement.length_ticks, Math.max(0, tick)),
    );

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3" aria-label="Isolated rehearsal controls">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium">{arrangement.name}</span>
          <Badge variant="outline">{arrangement.tempo_map.points.length} tempo points</Badge>
        </div>
        <Field>
          <FieldLabel htmlFor="rehearsal-playhead">Playhead tick</FieldLabel>
          <Input
            id="rehearsal-playhead"
            type="number"
            min={0}
            max={arrangement.length_ticks}
            value={session.playheadTick}
            onChange={(event) => seek(Number(event.target.value))}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              size="xs"
              variant="outline"
              onClick={() => seek(session.playheadTick - arrangement.ppq)}
            >
              <RotateCcw data-icon="inline-start" aria-hidden="true" />
              −1 beat
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => seek(session.playheadTick + arrangement.ppq)}
            >
              <RotateCw data-icon="inline-start" aria-hidden="true" />
              +1 beat
            </Button>
          </div>
        </Field>
        <Field>
          <FieldLabel>Loop snapshot</FieldLabel>
          <div className="grid grid-cols-2 gap-1.5">
            <Input
              aria-label="Rehearsal loop start tick"
              type="number"
              min={0}
              value={session.loopStartTick}
              onChange={(event) =>
                projectActions.setArrangementLoop(reference, {
                  ...session,
                  loopStartTick: Number(event.target.value),
                })
              }
            />
            <Input
              aria-label="Rehearsal loop end tick"
              type="number"
              min={1}
              value={session.loopEndTick}
              onChange={(event) =>
                projectActions.setArrangementLoop(reference, {
                  ...session,
                  loopEndTick: Number(event.target.value),
                })
              }
            />
          </div>
          <Button
            size="xs"
            variant={session.loopEnabled ? "secondary" : "outline"}
            aria-pressed={session.loopEnabled}
            onClick={() =>
              projectActions.setArrangementLoop(reference, {
                ...session,
                loopEnabled: !session.loopEnabled,
              })
            }
          >
            Loop {session.loopEnabled ? "on" : "off"}
          </Button>
          <FieldDescription>
            Seek and loop stay inside PreviewSession and never mutate Live transport.
          </FieldDescription>
        </Field>
      </div>
    </ScrollArea>
  );
}

function formatRevision(revision: number | null) {
  return revision === null ? "—" : `r${revision}`;
}
