import { CircleGauge, Info, SlidersHorizontal } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ControlPanel } from "@/panel/ControlPanel";
import { engineSelectors, useEngineStore } from "@/stores/engine";
import type { WorkspaceId } from "@/stores/workspace";
import { StageSetupInspector } from "./stage/StageSetupInspector";

export function WorkspaceInspector({ workspace }: { workspace: WorkspaceId }) {
  const document = useEngineStore(engineSelectors.parsedDsl);
  const compileErrors = useEngineStore(engineSelectors.compileErrors);

  if (workspace === "stage") return <StageSetupInspector />;
  if (workspace === "live") return <ControlPanel embedded />;

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label="Context inspector">
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <SlidersHorizontal className="text-muted-foreground size-3.5" aria-hidden="true" />
        <span className="text-xs font-medium">Inspector</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 p-2.5">
          <div className="border-border rounded-md border p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{inspectorTitle(workspace)}</span>
              <Badge variant="outline">Draft</Badge>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {inspectorDescription(workspace)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Metric label="Fixtures" value={String(fixtureTotal(document?.patch ?? []))} />
            <Metric label="Effects" value={String(document?.effect_definitions.length ?? 0)} />
            <Metric label="Groups" value={String(document?.groups.length ?? 0)} />
            <Metric label="Tracks" value={String(document?.timeline?.tracks.length ?? 0)} />
          </div>

          {compileErrors.length > 0 && (
            <Alert variant="destructive">
              <Info />
              <AlertTitle>Draft needs attention</AlertTitle>
              <AlertDescription>{compileErrors[0].message}</AlertDescription>
            </Alert>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border rounded-md border p-2">
      <div className="text-muted-foreground flex items-center gap-1 text-[10px]">
        <CircleGauge className="size-3" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function fixtureTotal(patch: Array<{ id_range: [number, number] }>) {
  return patch.reduce((total, item) => total + item.id_range[1] - item.id_range[0] + 1, 0);
}

function inspectorTitle(workspace: WorkspaceId) {
  return {
    stage: "Stage setup",
    "effect-lab": "Effect parameters",
    song: "Song and beat grid",
    arrange: "Timeline selection",
    live: "Live control",
  }[workspace];
}

function inspectorDescription(workspace: WorkspaceId) {
  return {
    stage: "Select fixtures, groups or layout items to edit stage properties.",
    "effect-lab": "Select an effect to edit its target, waveform and loop parameters.",
    song: "Import a song, then correct tempo, downbeat and sections here.",
    arrange: "Select a clip or automation keyframe to inspect typed values.",
    live: "Published snapshot controls and output diagnostics.",
  }[workspace];
}
