import { useEffect, useMemo, useState } from "react";
import { Layers2, Plus, Save, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { musicalPositionAtTick } from "@/authoring/musicalTime";
import type { CueDefinition, EffectDefinitionDocument } from "@/bridge/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { assetKey, exactAsset } from "@/document/projectModel";
import { cn } from "@/lib/utils";
import {
  authoringDraftActions,
  authoringDraftSelectors,
  useAuthoringDraftStore,
} from "@/stores/authoringDraft";
import { productionCatalogSelectors, useProductionCatalogStore } from "@/stores/productionCatalog";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { useWorkspaceStore, workspaceActions, workspaceSelectors } from "@/stores/workspace";
import { AuthoringSignalSpine } from "../AuthoringSignalSpine";
import {
  appendCueLayer,
  collectCueEffects,
  duplicateCueLayer,
  moveCueLayer,
  recomputeCueSummary,
  removeCueLayer,
  type CueLayerUpdate,
} from "./cueAuthoring";
import { CueLayerEditor } from "./CueLayerEditor";
import { WorkspacePanelHeader } from "../WorkspacePanelHeader";
import { CueLayerList } from "./CueLayerList";
import { useCueDraftValidation } from "./useCueDraftValidation";

export function CueBuilderInspector() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const reference = useProjectStore(projectSelectors.selectedCueRef);
  const selectedEffectRef = useProjectStore(projectSelectors.selectedEffectRef);
  const selectedArrangementRef = useProjectStore(projectSelectors.selectedArrangementRef);
  const catalog = useProductionCatalogStore(productionCatalogSelectors.catalog);
  const session = useAuthoringDraftStore(authoringDraftSelectors.cue);
  const comparison = useAuthoringDraftStore(authoringDraftSelectors.comparison);
  const advancedMode = useWorkspaceStore(workspaceSelectors.advancedMode);
  const [pendingHighRiskEffect, setPendingHighRiskEffect] =
    useState<EffectDefinitionDocument | null>(null);
  const persistedCue = exactAsset(bundle.cues, reference);
  const sessionMatches = Boolean(
    reference && session && assetKey(session.pinned) === assetKey(reference),
  );
  const effects = useMemo(() => collectCueEffects(bundle, catalog), [bundle, catalog]);
  const arrangement = exactAsset(bundle.arrangements, selectedArrangementRef);
  const barTicks = arrangement
    ? musicalPositionAtTick(0, arrangement.ppq, arrangement.time_signatures).barTicks
    : 3_840;
  const validate = useCueDraftValidation(bundle, catalog, session, sessionMatches);

  useEffect(() => {
    if (persistedCue) authoringDraftActions.beginCue(persistedCue);
  }, [persistedCue]);

  if (!reference || !session || !sessionMatches) return <CueBuilderEmpty />;
  const cue = session.working;
  const stage = exactAsset(bundle.stages, cue.compatible_stage_ref);
  if (!stage) return <CueBuilderEmpty error="This Cue no longer matches the current Stage." />;

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
  const appendEffect = (effect: EffectDefinitionDocument) => {
    let layerId = "";
    updateCue((draft) => {
      layerId = appendCueLayer(draft, effect, stage);
    });
    authoringDraftActions.selectCueLayer(layerId);
  };
  const addSelectedEffect = () => {
    const effect = effects.find(
      (candidate) => selectedEffectRef && assetKey(candidate) === assetKey(selectedEffectRef),
    );
    if (!effect) return;
    if (effect.catalog.strobe_risk === "high") {
      setPendingHighRiskEffect(effect);
      return;
    }
    appendEffect(effect);
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
      workspaceActions.setPublishStatus("idle", `${saved.name} saved.`);
    } catch (error) {
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : "Cue could not be saved.",
      );
    }
  };
  const saveAsNewDraft = () => {
    if (session.status !== "valid") return;
    const fork = structuredClone(session.lastKnownGood);
    fork.id = `cue-${crypto.randomUUID()}`;
    fork.revision = 1;
    fork.name = `${fork.name} Copy`;
    const productionEffects = catalog?.effects.filter((effect) =>
      fork.layers.some((layer) => assetKey(layer.effect_ref) === assetKey(effect)),
    );
    const saved = projectActions.saveCueWorkingDraft(fork, productionEffects ?? []);
    authoringDraftActions.commitCue(saved);
    workspaceActions.setPublishStatus("idle", `${saved.name} saved as a copy.`);
  };

  return (
    <>
      <aside
        className="bg-card flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
        aria-label="Cue Builder"
      >
        <WorkspacePanelHeader icon={Layers2} title="Cue Builder" iconClassName="text-primary">
          <Badge variant="outline" className="ml-auto">
            {session.mode === "new" ? "New Cue" : "Editing"}
          </Badge>
        </WorkspacePanelHeader>
        <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
          <div className="flex min-w-0 flex-col gap-3 p-3">
            {advancedMode && (
              <AuthoringSignalSpine
                revision={session.pinned.revision}
                status={session.status}
                comparison={comparison}
                onComparisonChange={authoringDraftActions.setComparison}
              />
            )}
            <CueCoreFields
              cue={cue}
              barTicks={barTicks}
              advanced={advancedMode}
              onUpdate={updateCue}
            />
            <Separator />
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium">Effects</span>
              <Badge variant="secondary">{cue.layers.length}</Badge>
              {advancedMode && (
                <Button
                  size="xs"
                  variant="outline"
                  className="ml-auto"
                  disabled={!selectedEffectRef}
                  onClick={addSelectedEffect}
                >
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  Add selected Effect
                </Button>
              )}
            </div>
            <CueLayerList
              cue={cue}
              effects={effects}
              session={session}
              onSelect={authoringDraftActions.selectCueLayer}
              onToggleMute={authoringDraftActions.toggleCueLayerMute}
              onToggleSolo={authoringDraftActions.toggleCueLayerSolo}
              advanced={advancedMode}
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
                onMove={(direction) =>
                  updateCue((draft) => moveCueLayer(draft, selectedLayer.id, direction))
                }
                onDuplicate={() => {
                  let duplicateId: string | null = null;
                  updateCue((draft) => {
                    duplicateId = duplicateCueLayer(draft, selectedLayer.id);
                  });
                  if (duplicateId) authoringDraftActions.selectCueLayer(duplicateId);
                }}
                advanced={advancedMode}
              />
            )}
            <CueSummary cue={cue} advanced={advancedMode} />
            <CueDiagnostics
              diagnostics={session.diagnostics}
              onRecompute={() => updateCue(() => undefined)}
              onRemoveOverride={(path) =>
                updateCue((draft) => removeIncompatibleOverride(draft, path))
              }
              onRevert={authoringDraftActions.revertCueToLastKnownGood}
            />
            {advancedMode && (
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
                  Save Cue
                </Button>
              </div>
            )}
            {!advancedMode && (
              <Button size="sm" disabled={session.status !== "valid"} onClick={save}>
                <Save data-icon="inline-start" aria-hidden="true" />
                Save Cue
              </Button>
            )}
            {advancedMode && (
              <Button size="xs" variant="ghost" onClick={authoringDraftActions.discardCue}>
                <Undo2 data-icon="inline-start" aria-hidden="true" />
                Discard changes
              </Button>
            )}
            {advancedMode && session.mode === "edit" && (
              <Button
                size="xs"
                variant="ghost"
                disabled={session.status !== "valid"}
                onClick={saveAsNewDraft}
              >
                Save as copy
              </Button>
            )}
            {advancedMode && session.mode === "edit" && <DeleteCueButton reference={reference} />}
          </div>
        </ScrollArea>
      </aside>
      <Dialog
        open={Boolean(pendingHighRiskEffect)}
        onOpenChange={(open) => !open && setPendingHighRiskEffect(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm high strobe risk</DialogTitle>
            <DialogDescription>
              {pendingHighRiskEffect?.name} can produce high-frequency intensity changes. Verify the
              target, audience safety policy, and safe defaults before adding this layer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingHighRiskEffect) appendEffect(pendingHighRiskEffect);
                setPendingHighRiskEffect(null);
              }}
            >
              Add high-risk layer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CueCoreFields({
  cue,
  barTicks,
  advanced,
  onUpdate,
}: {
  cue: CueDefinition;
  barTicks: number;
  advanced: boolean;
  onUpdate: (update: (draft: CueDefinition) => void) => void;
}) {
  const barOptions = [1, 2, 4, 8].map((bars) => ({
    value: String(bars * barTicks),
    label: `${bars} ${bars === 1 ? "bar" : "bars"}`,
  }));
  if (!barOptions.some((option) => option.value === String(cue.nominal_length_ticks))) {
    barOptions.push({ value: String(cue.nominal_length_ticks), label: "Custom length" });
  }
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
      {advanced ? (
        <Field>
          <FieldLabel htmlFor="cue-length">Exact length · ticks</FieldLabel>
          <Input
            id="cue-length"
            type="number"
            min={1}
            step={barTicks}
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
      ) : (
        <Field>
          <FieldLabel>Cue length</FieldLabel>
          <Select
            items={barOptions}
            value={String(cue.nominal_length_ticks)}
            onValueChange={(value) =>
              value &&
              onUpdate((draft) => {
                draft.nominal_length_ticks = Number(value);
              })
            }
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Cue length">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {barOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
    </FieldGroup>
  );
}

function CueSummary({ cue, advanced }: { cue: CueDefinition; advanced: boolean }) {
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
        {advanced && (
          <Badge variant="outline">{cue.automation_lanes?.length ?? 0} automation lanes</Badge>
        )}
      </div>
    </>
  );
}

function CueDiagnostics({
  diagnostics,
  onRecompute,
  onRemoveOverride,
  onRevert,
}: {
  diagnostics: CueDraftDiagnostic[];
  onRecompute: () => void;
  onRemoveOverride: (path: string) => void;
  onRevert: () => void;
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
      {item.recovery?.action === "remove_incompatible_override" && (
        <Button size="xs" variant="outline" onClick={() => onRemoveOverride(item.path)}>
          {item.recovery.label}
        </Button>
      )}
      <Button size="xs" variant="ghost" onClick={onRevert}>
        Revert to Last Known Good
      </Button>
    </div>
  ));
}

function removeIncompatibleOverride(cue: CueDefinition, path: string) {
  const match = /layers\[(\d+)]\.parameter_overrides\.([^.]+)/.exec(path);
  if (!match) return;
  const layer = cue.layers[Number(match[1])];
  const parameterId = match[2];
  if (!layer || !parameterId) return;
  const overrides = { ...(layer.parameter_overrides ?? {}) };
  delete overrides[parameterId];
  layer.parameter_overrides = overrides;
  cue.automation_lanes = (cue.automation_lanes ?? []).filter(
    (lane) => lane.target.layer_id !== layer.id || lane.target.parameter_id !== parameterId,
  );
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
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label="Cue Builder">
      <WorkspacePanelHeader icon={Layers2} title="Cue Builder" iconClassName="text-primary">
        <Badge variant="outline" className="ml-auto">
          Ready
        </Badge>
      </WorkspacePanelHeader>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <p
          className={cn(
            "max-w-48 text-center text-xs leading-relaxed",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {error ?? "Choose a Production recipe or create a Cue from the selected Effect."}
        </p>
      </div>
    </aside>
  );
}
