import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FlaskConical,
  GitFork,
  Layers2,
  Lightbulb,
  Save,
  ScanSearch,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { engine } from "@/bridge/commands";
import type { Diagnostic, EffectDefinitionDocument, ParameterValueDSL } from "@/bridge/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { fixtureIdsForStage } from "@/document/layoutDefinition";
import { effectTargetCompatibility, friendlyEffectAttribute } from "@/document/effectCompatibility";
import { activeLayout, activeStage, exactAsset, uniqueId } from "@/document/projectModel";
import { resolveTargetSet } from "@/document/stageTopology";
import {
  authoringDraftActions,
  authoringDraftSelectors,
  useAuthoringDraftStore,
} from "@/stores/authoringDraft";
import {
  productionCatalogActions,
  productionCatalogSelectors,
  useProductionCatalogStore,
} from "@/stores/productionCatalog";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { useWorkspaceStore, workspaceActions, workspaceSelectors } from "@/stores/workspace";
import { AuthoringSignalSpine } from "../AuthoringSignalSpine";
import { createCueDraftFromEffect } from "../cues/cueAuthoring";
import { StageCollectionEditorDialog } from "../stage/StageCollectionEditorDialog";
import { WorkspacePanelHeader } from "../WorkspacePanelHeader";
import { EffectParameterControls } from "./EffectParameterControls";

export function EffectLabInspector() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const reference = useProjectStore(projectSelectors.selectedEffectRef);
  const targetSetId = useProjectStore(projectSelectors.selectedTargetSetId);
  const catalog = useProductionCatalogStore(productionCatalogSelectors.catalog);
  const catalogStatus = useProductionCatalogStore(productionCatalogSelectors.status);
  const catalogError = useProductionCatalogStore(productionCatalogSelectors.error);
  const session = useAuthoringDraftStore(authoringDraftSelectors.effect);
  const comparison = useAuthoringDraftStore(authoringDraftSelectors.comparison);
  const advancedMode = useWorkspaceStore(workspaceSelectors.advancedMode);
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [confirmHighRiskUse, setConfirmHighRiskUse] = useState(false);
  const [targetEditorOpen, setTargetEditorOpen] = useState(false);
  const selectedEffect =
    exactAsset(bundle.effects, reference) ?? exactAsset(catalog?.effects ?? [], reference);
  const stage = activeStage(bundle);
  const layout = activeLayout(bundle);
  const fixtureCount = fixtureIdsForStage(stage).length;
  const selectedTarget =
    stage.target_sets.find((target) => target.id === targetSetId) ??
    stage.target_sets.find((target) => target.id === "all") ??
    stage.target_sets[0];

  useEffect(() => {
    if (selectedTarget && selectedTarget.id !== targetSetId) {
      projectActions.setSelectedTargetSetId(selectedTarget.id);
    }
  }, [selectedTarget, targetSetId]);

  useEffect(() => {
    void productionCatalogActions.ensureLoaded();
  }, []);

  useEffect(() => {
    if (selectedEffect) authoringDraftActions.beginEffect(selectedEffect);
  }, [selectedEffect]);

  const validate = useCallback((draft: EffectDefinitionDocument, generation: number) => {
    authoringDraftActions.markEffectValidating(generation);
    void engine
      .validateEffectWorkingDraft(draft)
      .then((normalized) => authoringDraftActions.acceptEffectValidation(generation, normalized))
      .catch((error) =>
        authoringDraftActions.rejectEffectValidation(generation, diagnosticsFrom(error, "effect")),
      );
  }, []);

  useEffect(() => {
    if (!session || session.status !== "dirty") return;
    const timeout = window.setTimeout(
      () => validate(structuredClone(session.working), session.generation),
      240,
    );
    return () => window.clearTimeout(timeout);
  }, [session, validate]);

  if (!selectedEffect || !reference || !session) {
    return (
      <aside
        className="bg-card flex h-full items-center justify-center p-4"
        aria-label="Effect inspector"
      >
        <p className="text-muted-foreground text-center text-xs">
          {catalogStatus === "error"
            ? `Production Catalog unavailable: ${catalogError}`
            : "Select an Effect to preview and use in a Cue."}
        </p>
      </aside>
    );
  }

  const effect = session.working;
  const readOnly = effect.source === "built_in" && session.mode === "edit";
  const commonParameters = effect.parameters.filter((parameter) => !parameter.advanced);
  const advancedParameters = effect.parameters.filter((parameter) => parameter.advanced);
  const parameterIndices = Object.fromEntries(
    effect.parameters.map((parameter, index) => [parameter.id, index]),
  );
  const targetItems = stage.target_sets.map((target) => {
    const count = resolveTargetSet(stage, layout, target)?.fixtureIds.length ?? 0;
    return {
      value: target.id,
      label:
        target.id === "all"
          ? `All fixtures · ${count}`
          : `${target.name} · ${count} of ${fixtureCount}`,
    };
  });
  const compatibility = selectedTarget
    ? effectTargetCompatibility(stage, layout, selectedTarget, effect)
    : null;
  const generalDiagnostics = session.diagnostics.filter(
    (diagnostic) => !diagnostic.path.includes("parameters["),
  );
  const canSave = !readOnly && session.status === "valid";

  const updateParameter = (parameterId: string, value: ParameterValueDSL) => {
    authoringDraftActions.updateEffect((draft) => {
      const parameter = draft.parameters.find((candidate) => candidate.id === parameterId);
      if (parameter) parameter.default_value = structuredClone(value);
    });
  };

  const updateParameterDefaultEnabled = (parameterId: string, enabled: boolean) => {
    authoringDraftActions.updateEffect((draft) => {
      const parameter = draft.parameters.find((candidate) => candidate.id === parameterId);
      if (parameter?.value_type === "color") parameter.default_enabled = enabled;
    });
  };

  const customize = () => {
    const custom = structuredClone(session.pinned);
    custom.id = uniqueId(
      `custom-${custom.id.split(".").slice(-1)[0] ?? "effect"}`,
      [...bundle.effects, ...(catalog?.effects ?? [])].map((candidate) => candidate.id),
    );
    custom.revision = 1;
    custom.name = `${custom.name} Custom`;
    custom.source = "project_local";
    authoringDraftActions.beginEffectCustomization(session.pinned, custom);
  };

  const save = () => {
    if (!canSave) return null;
    try {
      const saved = projectActions.saveEffectWorkingDraft(session.lastKnownGood);
      authoringDraftActions.commitEffect(saved);
      workspaceActions.setPublishStatus("idle", `${saved.name} saved.`);
      return saved;
    } catch (error) {
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : "Effect could not be saved.",
      );
      return null;
    }
  };

  const useEffectInCue = () => {
    const saved = !readOnly && session.status !== "pristine" ? save() : session.lastKnownGood;
    if (!saved) return;
    const currentBundle = useProjectStore.getState().bundle;
    const cue = createCueDraftFromEffect(
      currentBundle,
      { id: saved.id, revision: saved.revision },
      catalog,
      targetSetId,
    );
    authoringDraftActions.beginNewCue(cue);
    projectActions.setSelectedEffectRef({ id: saved.id, revision: saved.revision });
    projectActions.setSelectedCueRef({ id: cue.id, revision: cue.revision });
    workspaceActions.setActiveWorkspace("cues");
    workspaceActions.setPublishStatus("idle", `${saved.name} is ready in a new Cue.`);
  };

  const requestUseEffectInCue = () => {
    if (effect.catalog.strobe_risk === "high") {
      setConfirmHighRiskUse(true);
      return;
    }
    useEffectInCue();
  };

  const saveAsNewDraft = () => {
    if (!canSave) return;
    const fork = structuredClone(session.lastKnownGood);
    fork.id = uniqueId(
      `custom-${fork.id.replace(/[^a-z0-9-]+/g, "-")}`,
      bundle.effects.map((candidate) => candidate.id),
    );
    fork.revision = 1;
    fork.name = `${fork.name} Copy`;
    fork.source = "project_local";
    const saved = projectActions.saveEffectWorkingDraft(fork);
    authoringDraftActions.commitEffect(saved);
    workspaceActions.setPublishStatus("idle", `${saved.name} saved as a copy.`);
  };

  return (
    <>
      <aside className="bg-card flex h-full min-h-0 flex-col" aria-label="Effect Lab inspector">
        <WorkspacePanelHeader
          icon={FlaskConical}
          title="Effect controls"
          iconClassName="text-primary"
        >
          <Badge
            variant={effect.source === "built_in" ? "secondary" : "outline"}
            className="ml-auto"
          >
            {effect.source === "built_in" ? "Ready to use" : "Custom"}
          </Badge>
        </WorkspacePanelHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-3">
            {advancedMode && (
              <AuthoringSignalSpine
                status={session.status}
                comparison={comparison}
                onComparisonChange={authoringDraftActions.setComparison}
              />
            )}

            <Alert>
              <Lightbulb aria-hidden="true" />
              <AlertTitle>Previewing {stage.name}</AlertTitle>
              <AlertDescription>
                {layout.name} · {fixtureCount} patched fixtures. Effect Lab always uses the active
                Stage automatically.
              </AlertDescription>
            </Alert>

            {readOnly && (
              <div className="border-primary/30 bg-primary/5 grid gap-2 rounded-md border p-2.5">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <ShieldCheck className="text-primary size-3.5" aria-hidden="true" />
                  Production Effect
                </div>
                <FieldDescription>
                  Ready to use as-is. Customize only if you want your own version.
                </FieldDescription>
                <Button size="xs" variant="outline" onClick={customize}>
                  <GitFork data-icon="inline-start" aria-hidden="true" />
                  Customize
                </Button>
              </div>
            )}

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="effect-name">Effect name</FieldLabel>
                <Input
                  id="effect-name"
                  value={effect.name}
                  disabled={readOnly}
                  onChange={(event) =>
                    authoringDraftActions.updateEffect((draft) => {
                      draft.name = event.currentTarget.value;
                    })
                  }
                />
              </Field>
              <Field>
                <div className="flex items-center gap-2">
                  <FieldLabel htmlFor="effect-preview-target">Preview area</FieldLabel>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => setTargetEditorOpen(true)}
                  >
                    <ScanSearch data-icon="inline-start" aria-hidden="true" />
                    Edit areas
                  </Button>
                </div>
                <Select
                  items={targetItems}
                  value={selectedTarget?.id ?? ""}
                  onValueChange={(value) => value && projectActions.setSelectedTargetSetId(value)}
                >
                  <SelectTrigger id="effect-preview-target" size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {targetItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {compatibility?.fixtureCount ?? 0} of {fixtureCount} Stage fixtures are included.
                </FieldDescription>
              </Field>
            </FieldGroup>

            {compatibility && !compatibility.compatible && (
              <Alert variant="destructive">
                <AlertTitle>This Effect cannot run on the selected area</AlertTitle>
                <AlertDescription>
                  {compatibility.fixtureCount === 0
                    ? "This area contains no patched fixtures."
                    : `Its fixtures are missing ${compatibility.missingAttributes
                        .map(friendlyEffectAttribute)
                        .join(", ")}. Choose another area or update the Stage patch.`}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-1.5">
              {effect.catalog.family && <Badge variant="secondary">{effect.catalog.family}</Badge>}
              {effect.catalog.category && (
                <Badge variant="outline">{effect.catalog.category}</Badge>
              )}
              {(effect.catalog.layout_capabilities ?? []).map((capability) => (
                <Badge key={capability} variant="outline">
                  {capability}
                </Badge>
              ))}
              <Badge variant={effect.catalog.strobe_risk === "high" ? "destructive" : "secondary"}>
                {effect.catalog.strobe_risk} strobe risk
              </Badge>
            </div>

            <Separator />
            <EffectParameterControls
              parameters={commonParameters}
              diagnostics={session.diagnostics}
              readOnly={readOnly}
              parameterIndices={parameterIndices}
              onChange={updateParameter}
              onDefaultEnabledChange={updateParameterDefaultEnabled}
              onRestoreFallback={authoringDraftActions.restoreEffectFallback}
              showMetadata={advancedMode}
            />

            {advancedParameters.length > 0 && (
              <div className="grid gap-2">
                <Button
                  size="xs"
                  variant="ghost"
                  className="justify-start"
                  aria-expanded={advancedVisible}
                  onClick={() => setAdvancedVisible((visible) => !visible)}
                >
                  {advancedVisible ? (
                    <ChevronDown aria-hidden="true" />
                  ) : (
                    <ChevronRight aria-hidden="true" />
                  )}
                  Advanced parameters · {advancedParameters.length}
                </Button>
                {advancedVisible && (
                  <EffectParameterControls
                    parameters={advancedParameters}
                    diagnostics={session.diagnostics}
                    readOnly={readOnly}
                    parameterIndices={parameterIndices}
                    onChange={updateParameter}
                    onDefaultEnabledChange={updateParameterDefaultEnabled}
                    onRestoreFallback={authoringDraftActions.restoreEffectFallback}
                    showMetadata={advancedMode}
                  />
                )}
              </div>
            )}

            {advancedMode && (
              <div className="border-border bg-muted/20 grid gap-1.5 rounded-md border p-2.5">
                <p className="text-[10px] font-medium">Graph contract</p>
                <p className="text-muted-foreground text-[10px]">
                  {effect.graph.nodes.length} typed nodes ·{" "}
                  {effect.graph.nodes.filter((node) => node.type === "attribute_writer").length}{" "}
                  writers
                </p>
                <p className="text-muted-foreground text-[10px]">
                  Structural edits materialize through typed bindings before validation and save.
                </p>
                {!readOnly && (
                  <Button size="xs" variant="ghost" disabled={!canSave} onClick={saveAsNewDraft}>
                    Save as copy
                  </Button>
                )}
              </div>
            )}

            {generalDiagnostics.map((diagnostic) => (
              <div
                key={`${diagnostic.code}:${diagnostic.path}`}
                className="border-destructive/40 bg-destructive/5 grid gap-1 rounded-md border p-2"
              >
                <p className="text-destructive text-[10px]" role="alert">
                  {diagnostic.message}
                </p>
                {diagnostic.hint && (
                  <p className="text-muted-foreground text-[10px]">{diagnostic.hint}</p>
                )}
                <Button
                  size="xs"
                  variant="outline"
                  onClick={authoringDraftActions.revertEffectToLastKnownGood}
                >
                  Revert changes
                </Button>
              </div>
            ))}

            {advancedMode && (
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={readOnly || session.status === "validating"}
                  onClick={() => validate(structuredClone(session.working), session.generation)}
                >
                  <ShieldCheck data-icon="inline-start" aria-hidden="true" />
                  Validate
                </Button>
                <Button size="sm" disabled={!canSave} onClick={save}>
                  <Save data-icon="inline-start" aria-hidden="true" />
                  Save changes
                </Button>
              </div>
            )}
            <Button
              size="sm"
              disabled={
                !compatibility?.compatible ||
                (!readOnly && session.status !== "valid" && session.status !== "pristine")
              }
              onClick={requestUseEffectInCue}
            >
              <Layers2 data-icon="inline-start" aria-hidden="true" />
              {!readOnly && session.status !== "pristine" ? "Save & use in Cue" : "Use in Cue"}
            </Button>
            {advancedMode && (
              <Button
                size="xs"
                variant="ghost"
                disabled={readOnly || (session.status === "pristine" && session.mode === "edit")}
                onClick={authoringDraftActions.discardEffect}
              >
                <Undo2 data-icon="inline-start" aria-hidden="true" />
                Discard changes
              </Button>
            )}
          </div>
        </ScrollArea>
      </aside>
      <Dialog open={confirmHighRiskUse} onOpenChange={setConfirmHighRiskUse}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm high strobe risk</DialogTitle>
            <DialogDescription>
              This Effect can produce high-frequency intensity changes. Verify audience safety and
              the selected fixtures before using it in a Cue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                useEffectInCue();
                setConfirmHighRiskUse(false);
              }}
            >
              Use high-risk Effect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <StageCollectionEditorDialog
        kind="targets"
        open={targetEditorOpen}
        onOpenChange={setTargetEditorOpen}
      />
    </>
  );
}

function diagnosticsFrom(error: unknown, path: string): Diagnostic[] {
  if (Array.isArray(error)) return error as Diagnostic[];
  return [
    {
      code: "CATALOG_DRAFT_VALIDATION_FAILED",
      severity: "error",
      path,
      message: error instanceof Error ? error.message : String(error),
      hint: "Keep editing; preview remains on the Last Known Good candidate.",
    },
  ];
}
