import { useEffect, useMemo } from "react";
import { Layers2, Plus, Save, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import type { CueDefinition } from "@/bridge/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { assetKey, exactAsset } from "@/document/projectModel";
import {
  authoringDraftActions,
  authoringDraftSelectors,
  useAuthoringDraftStore,
} from "@/stores/authoringDraft";
import { productionCatalogSelectors, useProductionCatalogStore } from "@/stores/productionCatalog";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { workspaceActions } from "@/stores/workspace";
import { AuthoringSignalSpine } from "../AuthoringSignalSpine";
import {
  appendCueLayer,
  collectCueEffects,
  recomputeCueSummary,
  removeCueLayer,
  type CueLayerUpdate,
} from "./cueAuthoring";
import { CueLayerEditor } from "./CueLayerEditor";
import { CueLayerList } from "./CueLayerList";
import { useCueDraftValidation } from "./useCueDraftValidation";

export function CueBuilderInspector() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const reference = useProjectStore(projectSelectors.selectedCueRef);
  const selectedEffectRef = useProjectStore(projectSelectors.selectedEffectRef);
  const catalog = useProductionCatalogStore(productionCatalogSelectors.catalog);
  const session = useAuthoringDraftStore(authoringDraftSelectors.cue);
  const comparison = useAuthoringDraftStore(authoringDraftSelectors.comparison);
  const persistedCue = exactAsset(bundle.cues, reference);
  const sessionMatches = Boolean(
    reference && session && assetKey(session.pinned) === assetKey(reference),
  );
  const effects = useMemo(() => collectCueEffects(bundle, catalog), [bundle, catalog]);
  const validate = useCueDraftValidation(bundle, catalog, session, sessionMatches);

  useEffect(() => {
    if (persistedCue) authoringDraftActions.beginCue(persistedCue);
  }, [persistedCue]);

  if (!reference || !session || !sessionMatches) return <CueBuilderEmpty />;
  const cue = session.working;
  const stage = exactAsset(bundle.stages, cue.compatible_stage_ref);
  if (!stage) return <CueBuilderEmpty error="Pinned Cue Stage revision is missing." />;

  const selectedLayer =
    cue.layers.find((layer) => layer.id === session.selectedLayerId) ?? cue.layers[0];
  const selectedEffect = selectedLayer
    ? effects.find((effect) => assetKey(effect) === assetKey(selectedLayer.effect_ref))
    : undefined;

  const updateCue = (update: (draft: CueDefinition) => void) => {
    authoringDraftActions.updateCue((draft) => {
      update(draft);
      recomputeCueSummary(draft, effects);
    });
  };
  const updateLayer = (update: CueLayerUpdate) => {
    if (!selectedLayer) return;
    updateCue((draft) => {
      const layer = draft.layers.find((candidate) => candidate.id === selectedLayer.id);
      if (layer) update(layer, draft);
    });
  };
  const addSelectedEffect = () => {
    const effect = effects.find(
      (candidate) => selectedEffectRef && assetKey(candidate) === assetKey(selectedEffectRef),
    );
    if (!effect) return;
    let layerId = "";
    updateCue((draft) => {
      layerId = appendCueLayer(draft, effect, stage);
    });
    authoringDraftActions.selectCueLayer(layerId);
  };
  const removeSelected = () => {
    if (!selectedLayer || cue.layers.length <= 1) return;
    const next = cue.layers.find((layer) => layer.id !== selectedLayer.id);
    updateCue((draft) => removeCueLayer(draft, selectedLayer.id));
    authoringDraftActions.selectCueLayer(next?.id ?? null);
  };
  const save = () => {
    if (session.status !== "valid") return;
    const productionEffects = catalog?.effects.filter((effect) =>
      session.lastKnownGood.layers.some((layer) => assetKey(layer.effect_ref) === assetKey(effect)),
    );
    try {
      const saved = projectActions.saveCueWorkingDraft(
        session.lastKnownGood,
        productionEffects ?? [],
      );
      authoringDraftActions.commitCue(saved);
      workspaceActions.setPublishStatus(
        "idle",
        `${saved.name} saved as immutable revision ${saved.revision}.`,
      );
    } catch (error) {
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : "Cue revision could not be saved.",
      );
    }
  };

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label="Cue Builder">
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <Layers2 className="text-primary" aria-hidden="true" />
        <span className="text-xs font-medium">Cue Builder</span>
        <Badge variant="outline" className="ml-auto">
          {session.mode} · r{cue.revision}
        </Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          <AuthoringSignalSpine
            revision={session.pinned.revision}
            status={session.status}
            comparison={comparison}
            onComparisonChange={authoringDraftActions.setComparison}
          />
          <CueCoreFields cue={cue} onUpdate={updateCue} />
          <Separator />
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">Layers</span>
            <Badge variant="secondary">{cue.layers.length}</Badge>
            <Button
              size="xs"
              variant="outline"
              className="ml-auto"
              disabled={!selectedEffectRef}
              onClick={addSelectedEffect}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              Add selected
            </Button>
          </div>
          <CueLayerList
            cue={cue}
            effects={effects}
            session={session}
            onSelect={authoringDraftActions.selectCueLayer}
            onToggleMute={authoringDraftActions.toggleCueLayerMute}
            onToggleSolo={authoringDraftActions.toggleCueLayerSolo}
          />
          {selectedLayer && selectedEffect && (
            <CueLayerEditor
              cue={cue}
              layer={selectedLayer}
              effect={selectedEffect}
              effects={effects}
              stage={stage}
              onUpdate={updateLayer}
              onRemove={removeSelected}
            />
          )}
          <CueSummary cue={cue} />
          <CueDiagnostics
            diagnostics={session.diagnostics}
            onRecompute={() => updateCue(() => undefined)}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={session.status === "validating"}
              onClick={() => validate(structuredClone(session.working), session.generation)}
            >
              <ShieldCheck data-icon="inline-start" aria-hidden="true" />
              Validate
            </Button>
            <Button size="sm" disabled={session.status !== "valid"} onClick={save}>
              <Save data-icon="inline-start" aria-hidden="true" />
              Save new revision
            </Button>
          </div>
          <Button size="xs" variant="ghost" onClick={authoringDraftActions.discardCue}>
            <Undo2 data-icon="inline-start" aria-hidden="true" />
            Discard working draft
          </Button>
          {session.mode === "edit" && <DeleteCueButton reference={reference} />}
        </div>
      </ScrollArea>
    </aside>
  );
}

function CueCoreFields({
  cue,
  onUpdate,
}: {
  cue: CueDefinition;
  onUpdate: (update: (draft: CueDefinition) => void) => void;
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="cue-name">Cue name</FieldLabel>
        <Input
          id="cue-name"
          value={cue.name}
          onChange={(event) =>
            onUpdate((draft) => {
              draft.name = event.currentTarget.value;
            })
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="cue-length">Nominal length · ticks</FieldLabel>
        <Input
          id="cue-length"
          type="number"
          min={1}
          step={960}
          value={cue.nominal_length_ticks}
          onChange={(event) => {
            const value = Number(event.currentTarget.value);
            if (Number.isInteger(value))
              onUpdate((draft) => {
                draft.nominal_length_ticks = value;
              });
          }}
        />
      </Field>
    </FieldGroup>
  );
}

function CueSummary({ cue }: { cue: CueDefinition }) {
  return (
    <>
      <Separator />
      <div className="flex flex-wrap gap-1.5" aria-label="Cue capability and risk summary">
        {(cue.capability_summary.required_attributes ?? []).map((attribute) => (
          <Badge key={attribute} variant="outline">
            {attribute}
          </Badge>
        ))}
        <Badge variant={cue.risk_summary.strobe_risk === "high" ? "destructive" : "secondary"}>
          {cue.risk_summary.strobe_risk} strobe risk
        </Badge>
        <Badge variant="outline">{cue.automation_lanes?.length ?? 0} automation lanes</Badge>
      </div>
    </>
  );
}

function CueDiagnostics({
  diagnostics,
  onRecompute,
}: {
  diagnostics: CueDraftDiagnostic[];
  onRecompute: () => void;
}) {
  return diagnostics.map((item) => (
    <div
      key={`${item.code}:${item.path}`}
      className="border-destructive/40 bg-destructive/5 grid gap-1 rounded-md border p-2"
    >
      <p className="text-destructive text-[10px]" role="alert">
        {item.message}
      </p>
      {item.hint && <p className="text-muted-foreground text-[10px]">{item.hint}</p>}
      {item.recovery?.action === "recompute_cue_summary" && (
        <Button size="xs" variant="outline" onClick={onRecompute}>
          {item.recovery.label}
        </Button>
      )}
    </div>
  ));
}

type CueDraftDiagnostic = NonNullable<
  ReturnType<typeof useAuthoringDraftStore.getState>["cue"]
>["diagnostics"][number];

function DeleteCueButton({ reference }: { reference: { id: string; revision: number } }) {
  return (
    <Button
      size="xs"
      variant="destructive"
      onClick={() => {
        try {
          projectActions.deleteCue(reference);
        } catch (error) {
          workspaceActions.setPublishStatus(
            "error",
            error instanceof Error ? error.message : String(error),
          );
        }
      }}
    >
      <Trash2 data-icon="inline-start" aria-hidden="true" />
      Delete pinned Cue
    </Button>
  );
}

function CueBuilderEmpty({ error }: { error?: string }) {
  return (
    <aside className="bg-card flex h-full items-center justify-center p-4" aria-label="Cue Builder">
      <p
        className={
          error
            ? "text-destructive text-center text-xs"
            : "text-muted-foreground text-center text-xs"
        }
      >
        {error ?? "Choose a Production recipe or create a Cue from the selected Effect."}
      </p>
    </aside>
  );
}
