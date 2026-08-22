import { useEffect } from "react";
import { Copy, Plus, Star, Trash2 } from "lucide-react";
import type { EffectDefinitionDSL, FullDSL } from "@/bridge/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { engineActions, useEngineStore } from "@/stores/engine";
import { useWorkspaceStore, workspaceActions, workspaceSelectors } from "@/stores/workspace";
import {
  createEffectPair,
  duplicateEffectPair,
  effectIsUsed,
  primaryInstance,
} from "./effectFactory";

export function EffectCatalogLibrary({ document }: { document: FullDSL }) {
  const selectedEffectId = useWorkspaceStore(workspaceSelectors.selectedEffectId);
  const favorites = useWorkspaceStore(workspaceSelectors.favoriteEffectIds);

  useEffect(() => {
    if (
      document.effect_definitions.length > 0 &&
      !document.effect_definitions.some((effect) => effect.id === selectedEffectId)
    ) {
      workspaceActions.setSelectedEffectId(document.effect_definitions[0].id);
    }
  }, [document.effect_definitions, selectedEffectId]);

  const createEffect = () => {
    const pair = createEffectPair(document);
    engineActions.applyDocumentTransaction({
      id: crypto.randomUUID(),
      label: `Create effect ${pair.definition.name}`,
      commands: [{ type: "create_effect", ...pair }],
    });
    workspaceActions.setSelectedEffectId(pair.definition.id);
    workspaceActions.setPublishStatus("idle", `${pair.definition.name} created.`);
  };

  const duplicateEffect = (definition: EffectDefinitionDSL) => {
    const instance = primaryInstance(document, definition.id);
    if (!instance) return;
    const pair = duplicateEffectPair(document, definition, instance);
    engineActions.applyDocumentTransaction({
      id: crypto.randomUUID(),
      label: `Duplicate effect ${definition.name}`,
      commands: [{ type: "create_effect", ...pair }],
    });
    workspaceActions.setSelectedEffectId(pair.definition.id);
    workspaceActions.setPublishStatus("idle", `${pair.definition.name} created.`);
  };

  const deleteEffect = (definition: EffectDefinitionDSL) => {
    try {
      engineActions.applyDocumentTransaction({
        id: crypto.randomUUID(),
        label: `Delete effect ${definition.name}`,
        commands: [{ type: "delete_effect", definition_id: definition.id }],
      });
      if (favorites.includes(definition.id)) workspaceActions.toggleFavoriteEffect(definition.id);
      const next = useEngineStore.getState().parsedDsl?.effect_definitions[0]?.id ?? null;
      workspaceActions.setSelectedEffectId(next);
      workspaceActions.setPublishStatus("idle", `${definition.name} removed.`);
    } catch (error) {
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : "Effect could not be deleted.",
      );
    }
  };

  if (document.effect_definitions.length === 0) {
    return (
      <Empty className="min-h-52 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Plus aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No effects yet</EmptyTitle>
          <EmptyDescription>
            Create a reusable smooth accent without opening Raw DSL.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" onClick={createEffect}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            Create smooth accent
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button size="sm" variant="outline" className="mb-1 w-full" onClick={createEffect}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        New effect
      </Button>
      {document.effect_definitions.map((definition) => {
        const instance = primaryInstance(document, definition.id);
        const used = effectIsUsed(document, definition.id);
        const favorite = favorites.includes(definition.id);
        return (
          <div
            key={definition.id}
            className={cn(
              "border-border flex min-w-0 items-center gap-0.5 rounded-md border p-1",
              selectedEffectId === definition.id && "border-primary/50 bg-primary/5",
            )}
          >
            <Button
              variant="ghost"
              size="sm"
              draggable={Boolean(instance)}
              className="h-auto min-w-0 flex-1 justify-start px-1.5 py-1"
              onClick={() => workspaceActions.setSelectedEffectId(definition.id)}
              onDragStart={(event) => {
                if (!instance) return;
                event.dataTransfer.setData("application/x-lumina-effect-instance", instance.id);
                event.dataTransfer.effectAllowed = "copy";
              }}
            >
              <span className="min-w-0 flex-1 truncate text-left">{definition.name}</span>
              <Badge variant="outline" className="text-[9px]">
                Effect
              </Badge>
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={
                favorite
                  ? `Remove ${definition.name} from favorites`
                  : `Favorite ${definition.name}`
              }
              aria-pressed={favorite}
              onClick={() => workspaceActions.toggleFavoriteEffect(definition.id)}
            >
              <Star
                className={cn(favorite && "fill-amber-400 text-amber-400")}
                aria-hidden="true"
              />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Duplicate ${definition.name}`}
              onClick={() => duplicateEffect(definition)}
            >
              <Copy aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Delete ${definition.name}`}
              title={
                used
                  ? "Remove this effect from Arrange and automation before deleting it."
                  : undefined
              }
              disabled={used}
              onClick={() => deleteEffect(definition)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
