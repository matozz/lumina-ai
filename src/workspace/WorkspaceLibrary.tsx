import { Boxes, Copy, Layers2, Layers3, Lightbulb, Plus, RadioTower, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AssetRef, ProjectBundle } from "@/bridge/types";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { assetKey, exactAsset, latestRefsById } from "@/document/projectModel";
import { engineSelectors, useEngineStore } from "@/stores/engine";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import {
  type WorkspaceId,
  useWorkspaceStore,
  workspaceActions,
  workspaceSelectors,
} from "@/stores/workspace";

export function WorkspaceLibrary({ workspace }: { workspace: WorkspaceId }) {
  const bundle = useProjectStore(projectSelectors.bundle);
  const selectedEffectRef = useProjectStore(projectSelectors.selectedEffectRef);
  const selectedLayoutRef = useProjectStore(projectSelectors.selectedLayoutRef);
  const selectedCueRef = useProjectStore(projectSelectors.selectedCueRef);
  const liveEffects = useEngineStore(engineSelectors.liveEffects);
  const selectedLiveEffectId = useWorkspaceStore(workspaceSelectors.selectedLiveEffectId);
  const favorites = useWorkspaceStore(workspaceSelectors.favoriteEffectIds);

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
        {workspace === "stage" && (
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
            onClick={() => selectedEffectRef && projectActions.createCue([selectedEffectRef])}
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
              />
              <LayoutLibrarySection
                title="Generated / Advanced"
                refs={latestRefsById(bundle.manifest.layout_refs).filter(
                  (reference) =>
                    exactAsset(bundle.layouts, reference)?.category === "generated_advanced",
                )}
                bundle={bundle}
                selected={selectedLayoutRef}
              />
            </>
          )}

          {workspace === "effect-lab" && (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => projectActions.createEffect("Pulse")}
                >
                  Pulse
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => projectActions.createEffect("Gradient")}
                >
                  Gradient
                </Button>
              </div>
              {latestRefsById(bundle.manifest.effect_refs).map((reference) => {
                const effect = exactAsset(bundle.effects, reference);
                if (!effect) return null;
                return (
                  <Button
                    key={assetKey(reference)}
                    variant={
                      selectedEffectRef && assetKey(selectedEffectRef) === assetKey(reference)
                        ? "secondary"
                        : "ghost"
                    }
                    size="sm"
                    className="h-auto w-full justify-start py-1.5"
                    onClick={() => projectActions.setSelectedEffectRef(reference)}
                  >
                    <span className="min-w-0 flex-1 truncate text-left">{effect.name}</span>
                    <Badge variant="outline">r{effect.revision}</Badge>
                  </Button>
                );
              })}
            </>
          )}

          {(workspace === "cues" || workspace === "arrange") && (
            <>
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
                    <span className="text-muted-foreground text-[9px]">{cue.layers.length}L</span>
                    <Badge variant="outline">r{cue.revision}</Badge>
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
                <span className="text-muted-foreground font-mono text-[9px]">
                  r{effect.definition_revision}
                </span>
                {favorites.includes(effect.definition_id) && <Star aria-label="Favorite" />}
              </Button>
            ))}

          {workspace === "live" && liveEffects.length === 0 && (
            <CompactEmpty
              icon={Boxes}
              title="No Live snapshot"
              description="Publish a Project revision, then explicitly Take live."
            />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function LayoutLibrarySection({
  title,
  refs,
  bundle,
  selected,
}: {
  title: string;
  refs: AssetRef[];
  bundle: ProjectBundle;
  selected: AssetRef;
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
              <Badge variant="outline">r{layout.revision}</Badge>
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Duplicate ${layout.name}`}
              onClick={() => projectActions.duplicateLayout(reference)}
            >
              <Copy aria-hidden="true" />
            </Button>
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
