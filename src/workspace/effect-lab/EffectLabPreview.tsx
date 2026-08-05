import { RotateCw } from "lucide-react";
import { AuthoringTransportBar } from "@/authoring/AuthoringTransportBar";
import { CanvasView } from "@/canvas/CanvasView";
import { Badge } from "@/components/ui/badge";
import { exactAsset } from "@/document/projectModel";
import { authoringDraftSelectors, useAuthoringDraftStore } from "@/stores/authoringDraft";
import { productionCatalogSelectors, useProductionCatalogStore } from "@/stores/productionCatalog";
import { projectSelectors, useProjectStore } from "@/stores/project";
import { materializeAuthoringPreview } from "../authoringPreviewBundle";

export function EffectLabPreview() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const selected = useProjectStore(projectSelectors.selectedEffectRef);
  const selectedCue = useProjectStore(projectSelectors.selectedCueRef);
  const arrangementRef = useProjectStore(projectSelectors.selectedArrangementRef);
  const error = useProjectStore(projectSelectors.previewError);
  const effectDraft = useAuthoringDraftStore(authoringDraftSelectors.effect);
  const cueDraft = useAuthoringDraftStore(authoringDraftSelectors.cue);
  const comparison = useAuthoringDraftStore(authoringDraftSelectors.comparison);
  const catalog = useProductionCatalogStore(productionCatalogSelectors.catalog);
  const materialized = materializeAuthoringPreview(
    bundle,
    selected,
    selectedCue,
    { effect: effectDraft, cue: cueDraft, comparison },
    catalog,
  );
  const effect = materialized.effect;
  const arrangement = exactAsset(bundle.arrangements, arrangementRef);

  return (
    <section className="bg-background relative flex h-full min-h-0 flex-col">
      <div className="border-border bg-card/70 flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <RotateCw className="text-primary" aria-hidden="true" />
        <span className="text-xs font-medium">Effect loop preview</span>
        <Badge variant="outline">Authoring Preview</Badge>
        {effectDraft?.status === "invalid" && <Badge variant="destructive">Held at LKG</Badge>}
        <span className="text-muted-foreground ml-auto truncate text-[10px]">
          {effect ? `${effect.name} · r${effect.revision}` : "No Effect selected"}
        </span>
      </div>
      {materialized.effectRef && arrangement && (
        <AuthoringTransportBar
          scope="effect"
          reference={materialized.effectRef}
          arrangement={arrangement}
          disabled={!effect}
        />
      )}
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
