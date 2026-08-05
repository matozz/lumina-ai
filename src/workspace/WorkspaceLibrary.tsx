import { useEffect, useState } from "react";
import { Boxes, Copy, Layers2, Layers3, Lightbulb, Plus, RadioTower, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { AssetRef, ProjectBundle } from "@/bridge/types";
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
  assetKey,
  exactAsset,
  latestRefsById,
  uniqueId,
} from "@/document/projectModel";
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

  useEffect(() => {
    if (workspace === "effect-lab" || workspace === "cues") {
      void productionCatalogActions.ensureLoaded();
    }
  }, [workspace]);

  useEffect(() => {
    if (workspace === "effect-lab" && !selectedEffectRef && productionCatalog?.effects[0]) {
      const effect = productionCatalog.effects[0];
      projectActions.setSelectedEffectRef({ id: effect.id, revision: effect.revision });
    }
  }, [productionCatalog, selectedEffectRef, workspace]);

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
    const stage = activeStage(bundle);
    const cueId = uniqueId(
      recipeId.replace(/^recipe\./, "cue-").replace(/[^a-z0-9-]+/g, "-"),
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
      authoringDraftActions.beginNewCue(cue);
      projectActions.setSelectedCueRef({ id: cue.id, revision: cue.revision });
      workspaceActions.setPublishStatus("idle", `${cue.name} opened as a safe Cue draft.`);
    } catch (error) {
      const message = Array.isArray(error)
        ? error.map((diagnostic) => diagnostic.message).join(" · ")
        : error instanceof Error
          ? error.message
          : String(error);
      workspaceActions.setPublishStatus("error", message);
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
                  return (
                    <EffectLibraryButton
                      key={assetKey(reference)}
                      reference={reference}
                      name={effect.name}
                      family={effect.catalog.family ?? "effect"}
                      source="production"
                      selected={selectedEffectRef}
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
                return (
                  <EffectLibraryButton
                    key={assetKey(reference)}
                    reference={reference}
                    name={effect.name}
                    family={effect.catalog.family ?? "local"}
                    source="project"
                    selected={selectedEffectRef}
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
              {workspace === "cues" && (
                <>
                  <LibrarySectionLabel>Production Recipes</LibrarySectionLabel>
                  {productionCatalog?.cue_recipes.map((recipe) => (
                    <Button
                      key={`${recipe.id}@${recipe.revision}`}
                      size="sm"
                      variant="ghost"
                      className="h-auto w-full justify-start py-1.5"
                      title={recipe.description}
                      onClick={() => void startRecipeDraft(recipe.id, recipe.revision, recipe.name)}
                    >
                      <span className="min-w-0 flex-1 truncate text-left">{recipe.name}</span>
                      <span className="text-muted-foreground text-[9px]">
                        {recipe.layers.length} {recipe.layers.length === 1 ? "effect" : "effects"}
                      </span>
                    </Button>
                  ))}
                  <LibrarySectionLabel>Project Cues</LibrarySectionLabel>
                </>
              )}
              {workspace === "arrange" && (
                <p className="text-muted-foreground px-1 text-[10px]">
                  Select a Cue, then place it at the authoring playhead.
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
                  title="No Cues yet"
                  description="Create Effects first, then combine them in Cues."
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
    </aside>
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
}: {
  reference: AssetRef;
  name: string;
  family: string;
  source: "production" | "project";
  selected: AssetRef | null;
}) {
  return (
    <Button
      variant={selected && assetKey(selected) === assetKey(reference) ? "secondary" : "ghost"}
      size="sm"
      className="h-auto w-full justify-start py-1.5"
      onClick={() => projectActions.setSelectedEffectRef(reference)}
    >
      <span className="min-w-0 flex-1 truncate text-left">{name}</span>
      <span className="text-muted-foreground text-[9px]">{family}</span>
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
