import { Pause, Play, RotateCw } from "lucide-react";
import { CanvasView } from "@/canvas/CanvasView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { exactAsset } from "@/document/projectModel";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";

export function EffectLabPreview() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const selected = useProjectStore(projectSelectors.selectedEffectRef);
  const playback = useProjectStore(projectSelectors.effectPreviewPlayback);
  const tick = useProjectStore(projectSelectors.effectPreviewTick);
  const error = useProjectStore(projectSelectors.previewError);
  const effect = exactAsset(bundle.effects, selected);
  const playing = playback === "playing";

  return (
    <section className="bg-background relative flex h-full min-h-0 flex-col">
      <div className="border-border bg-card/70 flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <RotateCw className="text-primary" aria-hidden="true" />
        <span className="text-xs font-medium">Effect loop preview</span>
        <Badge variant="outline">Authoring Preview</Badge>
        <span className="text-muted-foreground ml-auto truncate text-[10px]">
          {effect ? `${effect.name} · r${effect.revision}` : "No Effect selected"}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={playing ? "Pause effect loop preview" : "Play effect loop preview"}
          disabled={!effect}
          onClick={() => projectActions.setEffectPreviewPlayback(playing ? "paused" : "playing")}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
      </div>
      <div className="border-border flex h-7 shrink-0 items-center gap-2 border-b px-2.5">
        <Slider
          aria-label="Scrub Effect preview"
          min={0}
          max={3_839}
          step={1}
          value={[tick]}
          disabled={!effect}
          onValueChange={(value) =>
            projectActions.setEffectPreviewTick(Array.isArray(value) ? (value[0] ?? 0) : value)
          }
        />
        <span className="text-muted-foreground w-16 text-right font-mono text-[10px] tabular-nums">
          {tick} t
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <CanvasView frameSource="preview" />
        {!effect && <PreviewMessage>Create or select an Effect to preview.</PreviewMessage>}
        {effect && error && <PreviewMessage>{error}</PreviewMessage>}
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
