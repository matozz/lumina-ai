import { useEffect, useState } from "react";
import {
  Boxes,
  Copy,
  Layers2,
  Layers3,
  Lightbulb,
  Plus,
  RadioTower,
  ScanSearch,
  Star,
} from "lucide-react";
import { authoringSessionKey, authoringTransportActions } from "@/authoring/transport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { engine } from "@/bridge/commands";
import type {
  AssetRef,
  CueRecipeTargetDSL,
  ProjectBundle,
  TargetSetSelector,
} from "@/bridge/types";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  activeStage,
  activeLayout,
  assetKey,
  exactAsset,
  latestRefsById,
  uniqueId,
} from "@/document/projectModel";
import { effectTargetCompatibility, friendlyEffectAttribute } from "@/document/effectCompatibility";
import { authoringDraftActions } from "@/stores/authoringDraft";
import { engineSelectors, useEngineStore } from "@/stores/engine";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import {
  productionCatalogActions,
  productionCatalogSelectors,
  useProductionCatalogStore,
} from "@/stores/productionCatalog";
import {
  type WorkspaceId,
  useWorkspaceStore,
  workspaceActions,
  workspaceSelectors,
} from "@/stores/workspace";
import { createCueDraftFromEffect } from "./cues/cueAuthoring";
import { StageCollectionEditorDialog } from "./stage/StageCollectionEditorDialog";

export function WorkspaceLibrary({ workspace }: { workspace: WorkspaceId }) {
  const bundle = useProjectStore(projectSelectors.bundle);
  const selectedEffectRef = useProjectStore(projectSelectors.selectedEffectRef);
  const selectedLayoutRef = useProjectStore(projectSelectors.selectedLayoutRef);
  const selectedCueRef = useProjectStore(projectSelectors.selectedCueRef);
  const liveEffects = useEngineStore(engineSelectors.liveEffects);
  const selectedLiveEffectId = useWorkspaceStore(workspaceSelectors.selectedLiveEffectId);
  const favorites = useWorkspaceStore(workspaceSelectors.favoriteEffectIds);
  const productionCatalog = useProductionCatalogStore(productionCatalogSelectors.catalog);
  const productionCatalogStatus = useProductionCatalogStore(productionCatalogSelectors.status);
  const productionCatalogError = useProductionCatalogStore(productionCatalogSelectors.error);
  const advancedMode = useWorkspaceStore(workspaceSelectors.advancedMode);
  const [confirmHighRiskCreate, setConfirmHighRiskCreate] = useState(false);
  const [resolvingRecipeId, setResolvingRecipeId] = useState<string | null>(null);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [targetEditorOpen, setTargetEditorOpen] = useState(false);
  const stage = activeStage(bundle);
  const layout = activeLayout(bundle);
  const selectedTargetSetId = useProjectStore(projectSelectors.selectedTargetSetId);
  const selectedTarget =
    stage.target_sets.find((target) => target.id === selectedTargetSetId) ??
    stage.target_sets.find((target) => target.id === "all") ??
    stage.target_sets[0];
  const allTarget = stage.target_sets.find((target) => target.id === "all") ?? stage.target_sets[0];

  useEffect(() => {
    if (workspace === "effect-lab" && allTarget && selectedTargetSetId !== allTarget.id) {
      projectActions.setSelectedTargetSetId(allTarget.id);
    }
  }, [workspace]);

  useEffect(() => {
    if (workspace === "effect-lab" || workspace === "cues" || workspace === "arrange") {
      void productionCatalogActions.ensureLoaded();
    }
  }, [workspace]);

  useEffect(() => {
    if (workspace === "effect-lab" && !selectedEffectRef && productionCatalog?.effects[0]) {
      const effect = productionCatalog.effects[0];
      projectActions.setSelectedEffectRef({ id: effect.id, revision: effect.revision });
    }
  }, [productionCatalog, selectedEffectRef, workspace]);

  useEffect(() => {
    const scope = workspace === "effect-lab" ? "effect" : workspace === "cues" ? "cue" : null;
    const reference =
      scope === "effect" ? selectedEffectRef : scope === "cue" ? selectedCueRef : null;
    if (!scope || !reference) return;
    const key = authoringSessionKey(scope, assetKey(reference));
    authoringTransportActions.ensureSession({ key, scope, durationTicks: 3_840 });
  }, [
    selectedCueRef?.id,
    selectedCueRef?.revision,
    selectedEffectRef?.id,
    selectedEffectRef?.revision,
    workspace,
  ]);

  const createCueDraft = () => {
    if (!selectedEffectRef) return;
    const cue = createCueDraftFromEffect(bundle, selectedEffectRef, productionCatalog);
    authoringDraftActions.beginNewCue(cue);
    projectActions.setSelectedCueRef({ id: cue.id, revision: cue.revision });
  };
  const startCueDraft = () => {
    if (!selectedEffectRef) return;
    const effect =
      exactAsset(productionCatalog?.effects ?? [], selectedEffectRef) ??
      exactAsset(bundle.effects, selectedEffectRef);
    if (effect?.catalog.strobe_risk === "high") {
      setConfirmHighRiskCreate(true);
      return;
    }
    createCueDraft();
  };

  const startRecipeDraft = async (recipeId: string, revision: number, name: string) => {
    setResolvingRecipeId(recipeId);
    setRecipeError(null);
    const baseCueId = recipeId.replace(/^recipe\./, "cue-").replace(/[^a-z0-9-]+/g, "-");
    const reusableCueRef =
      workspace === "arrange"
        ? latestRefsById(bundle.manifest.cue_refs).find((reference) => {
            const cue = exactAsset(bundle.cues, reference);
            return cue
              ? (cue.id === baseCueId || cue.id.startsWith(`${baseCueId}-`)) &&
                  cue.name === name &&
                  assetKey(cue.compatible_stage_ref) === assetKey(stage)
              : false;
          })
        : undefined;
    if (reusableCueRef) {
      projectActions.setSelectedCueRef(reusableCueRef);
      workspaceActions.setPublishStatus("idle", `${name} selected for placement.`);
      setResolvingRecipeId(null);
      return;
    }
    const cueId = uniqueId(
      baseCueId,
      bundle.cues.map((cue) => cue.id),
    );
    try {
      const cue = await engine.resolveProductionCueRecipe({
        project: bundle,
        recipeRef: { id: recipeId, revision },
        stageRef: { id: stage.id, revision: stage.revision },
        cueId,
        cueRevision: 1,
        cueName: name,
      });
      if (workspace === "arrange") {
        const productionEffects = [
          ...new Map(
            cue.layers.flatMap((layer) => {
              const effect = exactAsset(productionCatalog?.effects ?? [], layer.effect_ref);
              return effect ? [[assetKey(effect), effect] as const] : [];
            }),
          ).values(),
        ];
        const saved = projectActions.saveCueWorkingDraft(cue, productionEffects);
        projectActions.setSelectedCueRef({ id: saved.id, revision: saved.revision });
        workspaceActions.setPublishStatus(
          "idle",
          `${saved.name} added to Project Cues and selected for placement.`,
        );
      } else {
        authoringDraftActions.beginNewCue(cue);
        projectActions.setSelectedCueRef({ id: cue.id, revision: cue.revision });
        workspaceActions.setPublishStatus("idle", `${cue.name} opened as a safe Cue draft.`);
      }
    } catch (error) {
      const message = Array.isArray(error)
        ? error.map((diagnostic) => diagnostic.message).join(" · ")
        : error instanceof Error
          ? error.message
          : String(error);
      setRecipeError(message);
      workspaceActions.setPublishStatus("error", message);
    } finally {
      setResolvingRecipeId(null);
    }
  };

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label={`${workspace} library`}>
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <LibraryIcon workspace={workspace} />
        <span className="truncate text-xs font-medium">{libraryTitle(workspace)}</span>
        {workspace === "effect-lab" && (
          <Button
            size="icon-xs"
            variant="ghost"
            className="ml-auto"
            aria-label="Create Effect"
            onClick={() => projectActions.createEffect("Pulse")}
          >
            <Plus aria-hidden="true" />
          </Button>
        )}
        {workspace === "stage" && advancedMode && (
          <Button
            size="icon-xs"
            variant="ghost"
            className="ml-auto"
            aria-label="Duplicate selected Layout"
            onClick={() => projectActions.duplicateLayout(selectedLayoutRef)}
          >
            <Copy aria-hidden="true" />
          </Button>
        )}
        {workspace === "cues" && (
          <Button
            size="icon-xs"
            variant="ghost"
            className="ml-auto"
            aria-label="Create Cue"
            disabled={!selectedEffectRef}
            onClick={startCueDraft}
          >
            <Plus aria-hidden="true" />
          </Button>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1.5 p-2">
          {workspace === "stage" && (
            <>
              <LayoutLibrarySection
                title="Basic"
                refs={latestRefsById(bundle.manifest.layout_refs).filter(
                  (reference) => exactAsset(bundle.layouts, reference)?.category === "basic",
                )}
                bundle={bundle}
                selected={selectedLayoutRef}
                advanced={advancedMode}
              />
              {advancedMode && (
                <LayoutLibrarySection
                  title="Generated / Advanced"
                  refs={latestRefsById(bundle.manifest.layout_refs).filter(
                    (reference) =>
                      exactAsset(bundle.layouts, reference)?.category === "generated_advanced",
                  )}
                  bundle={bundle}
                  selected={selectedLayoutRef}
                  advanced={advancedMode}
                />
              )}
            </>
          )}

          {workspace === "effect-lab" && (
            <>
              <LibrarySectionLabel>Production Catalog</LibrarySectionLabel>
              {productionCatalog?.effects
                .filter((effect) => effect.catalog.visibility !== "hidden")
                .map((effect) => {
                  const reference = { id: effect.id, revision: effect.revision };
                  const compatibility = selectedTarget
                    ? effectTargetCompatibility(stage, layout, selectedTarget, effect)
                    : null;
                  return (
                    <EffectLibraryButton
                      key={assetKey(reference)}
                      reference={reference}
                      name={effect.name}
                      family={effect.catalog.family ?? "effect"}
                      source="production"
                      selected={selectedEffectRef}
                      disabled={compatibility ? !compatibility.compatible : true}
                      disabledReason={
                        compatibility && compatibility.missingAttributes.length > 0
                          ? `Needs ${compatibility.missingAttributes.map(friendlyEffectAttribute).join(", ")}`
                          : compatibility?.fixtureCount === 0
                            ? "No fixtures in this area"
                            : undefined
                      }
                    />
                  );
                })}
              {productionCatalogStatus === "loading" && (
                <p className="text-muted-foreground px-1 text-[10px]">Loading effects…</p>
              )}
              {productionCatalogStatus === "error" && (
                <p className="text-destructive px-1 text-[10px]">{productionCatalogError}</p>
              )}

              <LibrarySectionLabel>Project Drafts</LibrarySectionLabel>
              {latestRefsById(bundle.manifest.effect_refs).map((reference) => {
                const effect = exactAsset(bundle.effects, reference);
                if (!effect || effect.source === "built_in") return null;
                const compatibility = selectedTarget
                  ? effectTargetCompatibility(stage, layout, selectedTarget, effect)
                  : null;
                return (
                  <EffectLibraryButton
                    key={assetKey(reference)}
                    reference={reference}
                    name={effect.name}
                    family={effect.catalog.family ?? "local"}
                    source="project"
                    selected={selectedEffectRef}
                    disabled={compatibility ? !compatibility.compatible : true}
                    disabledReason={
                      compatibility && compatibility.missingAttributes.length > 0
                        ? `Needs ${compatibility.missingAttributes.map(friendlyEffectAttribute).join(", ")}`
                        : compatibility?.fixtureCount === 0
                          ? "No fixtures in this area"
                          : undefined
                    }
                  />
                );
              })}
              {bundle.effects.filter((effect) => effect.source !== "built_in").length === 0 && (
                <p className="text-muted-foreground px-1 text-[10px]">
                  Customize a Production Effect to save your own version.
                </p>
              )}
            </>
          )}

          {(workspace === "cues" || workspace === "arrange") && (
            <>
              <LibrarySectionLabel>
                {workspace === "arrange" ? "Built-in Cues" : "Production Recipes"}
              </LibrarySectionLabel>
              <Button
                size="xs"
                variant="outline"
                className="mx-1 justify-start"
                onClick={() => setTargetEditorOpen(true)}
              >
                <ScanSearch data-icon="inline-start" aria-hidden="true" />
                Edit fixture areas
              </Button>
              {productionCatalog?.cue_recipes.map((recipe) => {
                const missingAttributes = new Set<string>();
                const missingAreas = new Set<string>();
                let missingPlaybackPattern = false;
                for (const layer of recipe.layers) {
                  const effect = exactAsset(productionCatalog.effects, layer.effect_ref);
                  if (!effect) continue;
                  const targets = stage.target_sets.filter((target) =>
                    recipeTargetMatches(target.selector, layer.target),
                  );
                  if (targets.length === 0) {
                    missingAreas.add(friendlyRecipeTarget(layer.target));
                    continue;
                  }
                  const compatibility = targets.map((target) =>
                    effectTargetCompatibility(stage, layout, target, effect),
                  );
                  if (!compatibility.some((result) => result.compatible)) {
                    for (const result of compatibility) {
                      for (const attribute of result.missingAttributes) {
                        missingAttributes.add(attribute);
                      }
                    }
                  }
                  if (
                    layer.scene &&
                    !(stage.targeting_scenes ?? []).some(
                      (scene) =>
                        scene.steps.length >= layer.scene!.minimum_steps &&
                        (!layer.scene!.requires_weighted_transition ||
                          scene.steps.some((step) => step.transition.type === "weighted")),
                    )
                  ) {
                    missingPlaybackPattern = true;
                  }
                }
                const disabledReason =
                  missingAreas.size > 0
                    ? `Needs ${[...missingAreas].join(" or ")} area`
                    : missingAttributes.size > 0
                      ? `Needs ${[...missingAttributes].map(friendlyEffectAttribute).join(", ")}`
                      : missingPlaybackPattern
                        ? "Needs a compatible playback pattern"
                        : undefined;
                const resolving = resolvingRecipeId === recipe.id;
                return (
                  <Button
                    key={`${recipe.id}@${recipe.revision}`}
                    size="sm"
                    variant="ghost"
                    className="h-auto w-full justify-start py-1.5"
                    title={disabledReason ?? recipe.description}
                    disabled={Boolean(disabledReason) || resolvingRecipeId !== null}
                    onClick={() => void startRecipeDraft(recipe.id, recipe.revision, recipe.name)}
                  >
                    <span className="min-w-0 flex-1 truncate text-left">
                      {resolving ? (workspace === "arrange" ? "Adding…" : "Opening…") : recipe.name}
                    </span>
                    <span className="text-muted-foreground text-[9px]">
                      {disabledReason ??
                        `${recipe.layers.length} ${recipe.layers.length === 1 ? "effect" : "effects"}`}
                    </span>
                  </Button>
                );
              })}
              {recipeError && (
                <Alert variant="destructive">
                  <AlertTitle>Recipe unavailable</AlertTitle>
                  <AlertDescription>{recipeError}</AlertDescription>
                </Alert>
              )}
              <LibrarySectionLabel>Project Cues</LibrarySectionLabel>
              {workspace === "arrange" && (
                <p className="text-muted-foreground px-1 text-[10px]">
                  Choose a built-in or saved Cue, then place it at the playhead.
                </p>
              )}
              {latestRefsById(bundle.manifest.cue_refs).map((reference) => {
                const cue = exactAsset(bundle.cues, reference);
                if (!cue) return null;
                return (
                  <Button
                    key={assetKey(reference)}
                    variant={
                      selectedCueRef && assetKey(selectedCueRef) === assetKey(reference)
                        ? "secondary"
                        : "ghost"
                    }
                    size="sm"
                    className="h-auto w-full justify-start py-1.5"
                    onClick={() => projectActions.setSelectedCueRef(reference)}
                  >
                    <span className="min-w-0 flex-1 truncate text-left">{cue.name}</span>
                    <span className="text-muted-foreground text-[9px]">
                      {cue.layers.length} {cue.layers.length === 1 ? "effect" : "effects"}
                    </span>
                  </Button>
                );
              })}
              {bundle.cues.length === 0 && (
                <CompactEmpty
                  icon={Layers2}
                  title="No saved Cues yet"
                  description={
                    workspace === "arrange"
                      ? "Choose a built-in Cue above to add it to this project."
                      : "Create Effects first, then combine them in Cues."
                  }
                />
              )}
            </>
          )}

          {workspace === "live" &&
            liveEffects.map((effect) => (
              <Button
                key={effect.instance_id}
                variant={selectedLiveEffectId === effect.instance_id ? "secondary" : "ghost"}
                size="sm"
                className="h-auto w-full justify-start py-1.5"
                onClick={() => workspaceActions.setSelectedLiveEffectId(effect.instance_id)}
              >
                <span className="min-w-0 flex-1 truncate text-left">{effect.name}</span>
                {favorites.includes(effect.definition_id) && <Star aria-label="Favorite" />}
              </Button>
            ))}

          {workspace === "live" && liveEffects.length === 0 && (
            <CompactEmpty
              icon={Boxes}
              title="No Live snapshot"
              description="Publish your show, then explicitly Take live."
            />
          )}
        </div>
      </ScrollArea>
      <Dialog open={confirmHighRiskCreate} onOpenChange={setConfirmHighRiskCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm high strobe risk</DialogTitle>
            <DialogDescription>
              The selected Effect can produce high-frequency intensity changes. Verify the target,
              audience safety policy, and safe defaults before creating this Cue layer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                createCueDraft();
                setConfirmHighRiskCreate(false);
              }}
            >
              Create with high-risk layer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <StageCollectionEditorDialog
        kind="targets"
        open={targetEditorOpen}
        onOpenChange={setTargetEditorOpen}
      />
    </aside>
  );
}

function recipeTargetMatches(selector: TargetSetSelector, target: CueRecipeTargetDSL) {
  if (target.type === "any_compatible") return true;
  if (target.type === "center" || target.type === "edges") {
    return selector.type === "center_edges" && selector.region === target.type;
  }
  return selector.type === target.type;
}

function friendlyRecipeTarget(target: CueRecipeTargetDSL) {
  return (
    {
      any_compatible: "compatible",
      all: "All fixtures",
      rows: "Rows",
      columns: "Columns",
      grid_zones: "3×3 Zones",
      checkerboard: "Checkerboard",
      center: "Center",
      edges: "Edges",
    }[target.type] ?? target.type
  );
}

function LayoutLibrarySection({
  title,
  refs,
  bundle,
  selected,
  advanced,
}: {
  title: string;
  refs: AssetRef[];
  bundle: ProjectBundle;
  selected: AssetRef;
  advanced: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground px-1 pt-1 text-[9px] font-medium tracking-wide uppercase">
        {title}
      </p>
      {refs.map((reference) => {
        const layout = exactAsset(bundle.layouts, reference);
        if (!layout) return null;
        return (
          <div key={assetKey(reference)} className="flex min-w-0 items-center gap-1">
            <Button
              variant={assetKey(selected) === assetKey(reference) ? "secondary" : "ghost"}
              size="sm"
              className="h-auto min-w-0 flex-1 justify-start py-1.5"
              onClick={() => projectActions.setSelectedLayoutRef(reference)}
            >
              <span className="min-w-0 flex-1 truncate text-left">{layout.name}</span>
              <span className="text-muted-foreground text-[9px]">{layout.geometry.shape}</span>
            </Button>
            {advanced && (
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Duplicate ${layout.name}`}
                onClick={() => projectActions.duplicateLayout(reference)}
              >
                <Copy aria-hidden="true" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CompactEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Boxes;
  title: string;
  description: string;
}) {
  return (
    <Empty className="min-h-44 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function LibrarySectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground px-1 pt-1 text-[9px] font-medium tracking-wide uppercase">
      {children}
    </p>
  );
}

function EffectLibraryButton({
  reference,
  name,
  family,
  source,
  selected,
  disabled = false,
  disabledReason,
}: {
  reference: AssetRef;
  name: string;
  family: string;
  source: "production" | "project";
  selected: AssetRef | null;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <Button
      variant={selected && assetKey(selected) === assetKey(reference) ? "secondary" : "ghost"}
      size="sm"
      className="h-auto w-full justify-start py-1.5"
      disabled={disabled}
      title={disabledReason}
      onClick={() => projectActions.setSelectedEffectRef(reference)}
    >
      <span className="min-w-0 flex-1 truncate text-left">{name}</span>
      <span className="text-muted-foreground max-w-28 shrink-0 truncate text-[9px]">
        {disabledReason ?? family}
      </span>
      {source === "project" && <Badge variant="outline">Custom</Badge>}
    </Button>
  );
}

function LibraryIcon({ workspace }: { workspace: WorkspaceId }) {
  const Icon = {
    stage: Lightbulb,
    "effect-lab": Boxes,
    cues: Layers2,
    arrange: Layers3,
    live: RadioTower,
  }[workspace];
  return <Icon className="text-muted-foreground" aria-hidden="true" />;
}

function libraryTitle(workspace: WorkspaceId) {
  return {
    stage: "Layout Library",
    "effect-lab": "Effect assets",
    cues: "Cue assets",
    arrange: "Cue Library",
    live: "Live effects",
  }[workspace];
}
