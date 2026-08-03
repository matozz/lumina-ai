import { Layers2, Pause, Play } from "lucide-react";
import { CanvasView } from "@/canvas/CanvasView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { exactAsset } from "@/document/projectModel";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";

export function CuePreview() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const selected = useProjectStore(projectSelectors.selectedCueRef);
  const playback = useProjectStore(projectSelectors.cuePreviewPlayback);
  const tick = useProjectStore(projectSelectors.cuePreviewTick);
  const error = useProjectStore(projectSelectors.previewError);
  const cue = exactAsset(bundle.cues, selected);
  const playing = playback === "playing";
  const maximum = Math.max(1, (cue?.nominal_length_ticks ?? 3_840) - 1);

  return (
    <section className="bg-background relative flex h-full min-h-0 flex-col">
      <div className="border-border bg-card/70 flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <Layers2 className="text-primary" aria-hidden="true" />
        <span className="text-xs font-medium">Cue loop preview</span>
        <Badge variant="outline">Authoring Preview</Badge>
        <span className="text-muted-foreground ml-auto truncate text-[10px]">
          {cue ? `${cue.name} · ${cue.layers.length} layers · r${cue.revision}` : "No Cue selected"}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={playing ? "Pause Cue loop preview" : "Play Cue loop preview"}
          disabled={!cue}
          onClick={() => projectActions.setCuePreviewPlayback(playing ? "paused" : "playing")}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
      </div>
      <div className="border-border flex h-7 shrink-0 items-center gap-2 border-b px-2.5">
        <Slider
          aria-label="Scrub Cue preview"
          min={0}
          max={maximum}
          step={1}
          value={[Math.min(tick, maximum)]}
          disabled={!cue}
          onValueChange={(value) =>
            projectActions.setCuePreviewTick(Array.isArray(value) ? (value[0] ?? 0) : value)
          }
        />
        <span className="text-muted-foreground w-16 text-right font-mono text-[10px] tabular-nums">
          {tick} t
        </span>
      </div>
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
