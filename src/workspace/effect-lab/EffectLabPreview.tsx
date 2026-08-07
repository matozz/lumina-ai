import { RotateCw } from "lucide-react";
import { AuthoringTransportBar } from "@/authoring/AuthoringTransportBar";
import { CanvasView } from "@/canvas/CanvasView";
import { Badge } from "@/components/ui/badge";
import { activeStage, exactAsset } from "@/document/projectModel";
import { authoringDraftSelectors, useAuthoringDraftStore } from "@/stores/authoringDraft";
import { productionCatalogSelectors, useProductionCatalogStore } from "@/stores/productionCatalog";
import {
  PREVIEW_DARK_FRAME_NOTICE_THRESHOLD,
  projectSelectors,
  useProjectStore,
} from "@/stores/project";
import { materializeAuthoringPreview } from "../authoringPreviewBundle";
import { WorkspacePanelHeader } from "../WorkspacePanelHeader";

export function EffectLabPreview() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const selected = useProjectStore(projectSelectors.selectedEffectRef);
  const selectedCue = useProjectStore(projectSelectors.selectedCueRef);
  const arrangementRef = useProjectStore(projectSelectors.selectedArrangementRef);
  const error = useProjectStore(projectSelectors.previewError);
  const previewSummary = useProjectStore(projectSelectors.previewSummary);
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
    { scope: "effect", arrangementRef },
  );
  const effect = materialized.effect;
  const arrangement = exactAsset(bundle.arrangements, arrangementRef);
  const stage = activeStage(bundle);
  const showIntensityWithoutColor = Boolean(
    effect && !(effect.catalog.required_attributes ?? []).includes("color.rgb"),
  );
  const noVisibleOutput =
    (previewSummary?.consecutiveDarkFrames ?? 0) >= PREVIEW_DARK_FRAME_NOTICE_THRESHOLD;

  return (
    <section className="bg-background relative flex h-full min-h-0 flex-col">
      <WorkspacePanelHeader
        icon={RotateCw}
        title="Effect loop preview"
        iconClassName="text-primary"
      >
        <Badge variant="outline">Authoring Preview</Badge>
        {showIntensityWithoutColor && <Badge variant="outline">Intensity visualization</Badge>}
        {noVisibleOutput && <Badge variant="secondary">No visible output</Badge>}
        {effectDraft?.status === "invalid" && <Badge variant="destructive">Preview paused</Badge>}
        <span className="text-muted-foreground ml-auto truncate text-[10px]">
          {effect ? `${effect.name} · ${stage.name}` : "No Effect selected"}
        </span>
      </WorkspacePanelHeader>
      {materialized.effectRef && arrangement && (
        <AuthoringTransportBar
          scope="effect"
          reference={materialized.effectRef}
          arrangement={arrangement}
          disabled={!effect}
        />
      )}
      <div className="relative min-h-0 flex-1">
        <CanvasView frameSource="preview" showIntensityWithoutColor={showIntensityWithoutColor} />
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
