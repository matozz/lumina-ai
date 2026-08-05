import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FlaskConical,
  GitFork,
  Save,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { engine } from "@/bridge/commands";
import type { Diagnostic, EffectDefinitionDocument, ParameterValueDSL } from "@/bridge/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { activeStage, exactAsset, uniqueId } from "@/document/projectModel";
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
import { workspaceActions } from "@/stores/workspace";
import { AuthoringSignalSpine } from "../AuthoringSignalSpine";
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
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const selectedEffect =
    exactAsset(bundle.effects, reference) ?? exactAsset(catalog?.effects ?? [], reference);
  const stage = activeStage(bundle);

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
            : "Select a Production or Project Effect revision."}
        </p>
      </aside>
    );
  }

  const effect = session.working;
  const readOnly = effect.source === "built_in" && session.mode === "edit";
  const commonParameters = effect.parameters.filter((parameter) => !parameter.advanced);
  const advancedParameters = effect.parameters.filter((parameter) => parameter.advanced);
  const targetItems = stage.target_sets.map((target) => ({ value: target.id, label: target.name }));
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
    if (!canSave) return;
    try {
      const saved = projectActions.saveEffectWorkingDraft(session.lastKnownGood);
      authoringDraftActions.commitEffect(saved);
      workspaceActions.setPublishStatus(
        "idle",
        `${saved.name} saved as immutable revision ${saved.revision}.`,
      );
    } catch (error) {
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : "Effect revision could not be saved.",
      );
    }
  };

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label="Effect Lab inspector">
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <FlaskConical className="text-primary" aria-hidden="true" />
        <span className="text-xs font-medium">Effect controls</span>
        <Badge variant={effect.source === "built_in" ? "secondary" : "outline"} className="ml-auto">
          {effect.source.replace("_", " ")} · r{effect.revision}
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

          {readOnly && (
            <div className="border-primary/30 bg-primary/5 grid gap-2 rounded-md border p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <ShieldCheck className="text-primary size-3.5" aria-hidden="true" />
                Production revision is read-only
              </div>
              <FieldDescription>
                Customize creates a project-local fork. The built-in identity remains pinned and
                unchanged.
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
              <FieldLabel htmlFor="effect-preview-target">Preview TargetSet</FieldLabel>
              <Select
                items={targetItems}
                value={targetSetId}
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
                PreviewSession-only choice; it is never written into the Effect asset.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <div className="flex flex-wrap gap-1.5">
            {effect.catalog.family && <Badge variant="secondary">{effect.catalog.family}</Badge>}
            {effect.catalog.category && <Badge variant="outline">{effect.catalog.category}</Badge>}
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
            onChange={updateParameter}
            onRestoreFallback={authoringDraftActions.restoreEffectFallback}
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
                  onChange={updateParameter}
                  onRestoreFallback={authoringDraftActions.restoreEffectFallback}
                />
              )}
            </div>
          )}

          <div className="border-border bg-muted/20 grid gap-1.5 rounded-md border p-2.5">
            <p className="text-[10px] font-medium">Graph contract</p>
            <p className="text-muted-foreground text-[10px]">
              {effect.graph.nodes.length} typed nodes ·{" "}
              {effect.graph.nodes.filter((node) => node.type === "attribute_writer").length} writers
            </p>
            <p className="text-muted-foreground text-[10px]">
              Structural edits materialize through typed bindings before validation and save.
            </p>
          </div>

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
            </div>
          ))}

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
              Save new revision
            </Button>
          </div>
          <Button
            size="xs"
            variant="ghost"
            disabled={readOnly || (session.status === "pristine" && session.mode === "edit")}
            onClick={authoringDraftActions.discardEffect}
          >
            <Undo2 data-icon="inline-start" aria-hidden="true" />
            Discard working draft
          </Button>
        </div>
      </ScrollArea>
    </aside>
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
