import { Layers2 } from "lucide-react";
import { AuthoringTransportBar } from "@/authoring/AuthoringTransportBar";
import { CanvasView } from "@/canvas/CanvasView";
import { Badge } from "@/components/ui/badge";
import { exactAsset } from "@/document/projectModel";
import { authoringDraftSelectors, useAuthoringDraftStore } from "@/stores/authoringDraft";
import { productionCatalogSelectors, useProductionCatalogStore } from "@/stores/productionCatalog";
import {
  PREVIEW_DARK_FRAME_NOTICE_THRESHOLD,
  projectSelectors,
  useProjectStore,
} from "@/stores/project";
import { materializeAuthoringPreview } from "../authoringPreviewBundle";
import { WorkspacePanelHeader } from "../WorkspacePanelHeader";

export function CuePreview() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const selected = useProjectStore(projectSelectors.selectedCueRef);
  const selectedEffect = useProjectStore(projectSelectors.selectedEffectRef);
  const arrangementRef = useProjectStore(projectSelectors.selectedArrangementRef);
  const error = useProjectStore(projectSelectors.previewError);
  const previewSummary = useProjectStore(projectSelectors.previewSummary);
  const effectDraft = useAuthoringDraftStore(authoringDraftSelectors.effect);
  const cueDraft = useAuthoringDraftStore(authoringDraftSelectors.cue);
  const comparison = useAuthoringDraftStore(authoringDraftSelectors.comparison);
  const catalog = useProductionCatalogStore(productionCatalogSelectors.catalog);
  const materialized = materializeAuthoringPreview(
    bundle,
    selectedEffect,
    selected,
    { effect: effectDraft, cue: cueDraft, comparison },
    catalog,
    { scope: "cue", arrangementRef },
  );
  const cue = materialized.cue;
  const arrangement = exactAsset(bundle.arrangements, arrangementRef);
  const showIntensityWithoutColor = Boolean(
    cue && !(cue.capability_summary.required_attributes ?? []).includes("color.rgb"),
  );
  const noVisibleOutput =
    (previewSummary?.consecutiveDarkFrames ?? 0) >= PREVIEW_DARK_FRAME_NOTICE_THRESHOLD;

  return (
    <section className="bg-background relative flex h-full min-h-0 flex-col">
      <WorkspacePanelHeader icon={Layers2} title="Cue loop preview" iconClassName="text-primary">
        <Badge variant="outline">Authoring Preview</Badge>
        {showIntensityWithoutColor && <Badge variant="outline">Intensity visualization</Badge>}
        {noVisibleOutput && <Badge variant="secondary">No visible output</Badge>}
        {cueDraft?.status === "invalid" && <Badge variant="destructive">Preview paused</Badge>}
        {cueDraft && (cueDraft.soloLayerId || cueDraft.mutedLayerIds.length > 0) && (
          <Badge variant="secondary">Audition filter</Badge>
        )}
        <span className="text-muted-foreground ml-auto truncate text-[10px]">
          {cue ? `${cue.name} · ${cue.layers.length} effects` : "No Cue selected"}
        </span>
      </WorkspacePanelHeader>
      {materialized.cueRef && arrangement && (
        <AuthoringTransportBar
          scope="cue"
          reference={materialized.cueRef}
          arrangement={arrangement}
          disabled={!cue}
        />
      )}
      <div className="relative min-h-0 flex-1">
        <CanvasView frameSource="preview" showIntensityWithoutColor={showIntensityWithoutColor} />
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
