import type { CueDefinition, EffectDefinitionDocument } from "@/bridge/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { assetKey } from "@/document/projectModel";
import type { CueDraftSession } from "@/stores/authoringDraft";

export function CueLayerList({
  cue,
  effects,
  session,
  onSelect,
  onToggleMute,
  onToggleSolo,
}: {
  cue: CueDefinition;
  effects: EffectDefinitionDocument[];
  session: CueDraftSession;
  onSelect: (layerId: string) => void;
  onToggleMute: (layerId: string) => void;
  onToggleSolo: (layerId: string) => void;
}) {
  const activeUnmuted = cue.layers.filter(
    (candidate) => !session.mutedLayerIds.includes(candidate.id),
  ).length;
  return (
    <div className="grid gap-1">
      {cue.layers.map((layer, index) => {
        const definition = effects.find(
          (effect) => assetKey(effect) === assetKey(layer.effect_ref),
        );
        const muted = session.mutedLayerIds.includes(layer.id);
        const solo = session.soloLayerId === layer.id;
        return (
          <div key={layer.id} className="flex min-w-0 items-center gap-1">
            <Button
              size="sm"
              variant={session.selectedLayerId === layer.id ? "secondary" : "ghost"}
              className="h-auto min-w-0 flex-1 justify-start py-1.5"
              onClick={() => onSelect(layer.id)}
            >
              <Badge variant="outline">L{index + 1}</Badge>
              <span className="min-w-0 flex-1 truncate text-left">
                {definition?.name ?? layer.id}
              </span>
              <span className="text-muted-foreground text-[9px]">P{layer.priority ?? 0}</span>
            </Button>
            <Button
              size="icon-xs"
              variant={muted ? "secondary" : "ghost"}
              aria-label={`Mute layer ${index + 1}`}
              aria-pressed={muted}
              disabled={!muted && activeUnmuted <= 1}
              onClick={() => onToggleMute(layer.id)}
            >
              M
            </Button>
            <Button
              size="icon-xs"
              variant={solo ? "secondary" : "ghost"}
              aria-label={`Solo layer ${index + 1}`}
              aria-pressed={solo}
              onClick={() => onToggleSolo(layer.id)}
            >
              S
            </Button>
          </div>
        );
      })}
    </div>
  );
}
