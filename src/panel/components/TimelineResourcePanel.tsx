import { ListMusic } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FullDSL } from "@/bridge/types";
import { Button } from "@/components/ui/button";

interface ResourcePanelProps {
  document: FullDSL | null;
  selectedPhaser: string | null;
  onSelectPhaser: (id: string | null) => void;
}

export const TimelineResourcePanel = (props: ResourcePanelProps) => {
  const { document, selectedPhaser, onSelectPhaser } = props;
  const effects =
    document?.effect_instances.flatMap((instance) => {
      const definition = document.effect_definitions.find(
        (candidate) =>
          candidate.id === instance.definition_id &&
          candidate.revision === instance.definition_revision,
      );
      return definition ? [{ definition, instance }] : [];
    }) ?? [];

  return (
    <div
      className={cn(
        "z-10 flex w-[clamp(9rem,13vw,12rem)] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/40",
      )}
      data-layout-region="library"
    >
      <div
        className={cn(
          "flex h-7 items-center border-b border-zinc-800/60 bg-zinc-900/60 px-3 shadow-sm",
        )}
      >
        <span
          className={cn(
            "flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-zinc-400 uppercase",
          )}
        >
          <ListMusic className="h-3 w-3" /> Library
        </span>
      </div>
      <div className={cn("custom-scrollbar flex-1 overflow-y-auto p-2")}>
        <div className="mb-4">
          <div className={cn("mb-2 px-1 text-[10px] font-semibold tracking-wider text-zinc-500")}>
            EFFECTS
          </div>
          <div className="flex flex-col gap-1">
            {effects.map(({ definition, instance }) => (
              <Button
                key={`res-effect-${instance.id}`}
                variant="ghost"
                draggable
                onClick={() => onSelectPhaser(selectedPhaser === instance.id ? null : instance.id)}
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-lumina-effect-instance", instance.id);
                  event.dataTransfer.effectAllowed = "copy";
                }}
                className={cn(
                  "group flex h-auto items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors motion-reduce:transition-none",
                  selectedPhaser === instance.id
                    ? "border-indigo-500/50 bg-indigo-500/20 text-indigo-300 shadow-sm hover:bg-indigo-500/30 hover:text-indigo-200"
                    : "border-transparent bg-zinc-800/30 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                )}
                aria-pressed={selectedPhaser === instance.id}
                aria-label={`${definition.name}. Select or drag to timeline`}
              >
                <span className="truncate">{definition.name}</span>
              </Button>
            ))}
            {effects.length === 0 && (
              <div className="rounded-md border border-dashed border-zinc-800 px-2 py-3 text-xs text-zinc-500">
                <p className="font-medium text-zinc-400">No effects yet.</p>
                <p className="mt-1">Create one in Effect Lab, then return here.</p>
              </div>
            )}
          </div>
        </div>
        {effects.length > 0 && (
          <p className="border-t border-zinc-800 px-1 pt-3 text-[10px] leading-relaxed text-zinc-500">
            Click an effect, then click the timeline—or drag it directly onto a track.
          </p>
        )}
      </div>
    </div>
  );
};
