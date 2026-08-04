import { Layers2 } from "lucide-react";
import { AuthoringTransportBar } from "@/authoring/AuthoringTransportBar";
import { CanvasView } from "@/canvas/CanvasView";
import { Badge } from "@/components/ui/badge";
import { exactAsset } from "@/document/projectModel";
import { projectSelectors, useProjectStore } from "@/stores/project";

export function CuePreview() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const selected = useProjectStore(projectSelectors.selectedCueRef);
  const arrangementRef = useProjectStore(projectSelectors.selectedArrangementRef);
  const error = useProjectStore(projectSelectors.previewError);
  const cue = exactAsset(bundle.cues, selected);
  const arrangement = exactAsset(bundle.arrangements, arrangementRef);

  return (
    <section className="bg-background relative flex h-full min-h-0 flex-col">
      <div className="border-border bg-card/70 flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <Layers2 className="text-primary" aria-hidden="true" />
        <span className="text-xs font-medium">Cue loop preview</span>
        <Badge variant="outline">Authoring Preview</Badge>
        <span className="text-muted-foreground ml-auto truncate text-[10px]">
          {cue ? `${cue.name} · ${cue.layers.length} layers · r${cue.revision}` : "No Cue selected"}
        </span>
      </div>
      {selected && arrangement && (
        <AuthoringTransportBar
          scope="cue"
          reference={selected}
          arrangement={arrangement}
          disabled={!cue}
        />
      )}
      <div className="relative min-h-0 flex-1">
        <CanvasView frameSource="preview" />
        {!cue && <PreviewMessage>Create or select a Cue to preview.</PreviewMessage>}
        {cue && error && <PreviewMessage>{error}</PreviewMessage>}
      </div>
    </section>
  );
}

function PreviewMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background/80 absolute inset-0 flex items-center justify-center p-6 backdrop-blur-sm">
      <p className="text-muted-foreground max-w-sm text-center text-xs">{children}</p>
    </div>
  );
}
