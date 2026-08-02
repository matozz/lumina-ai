import { ListMusic } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompileResult } from "@/bridge/types";
import { Button } from "@/components/ui/button";

interface ResourcePanelProps {
  compileResult: CompileResult | null;
  selectedPhaser: string | null;
  onSelectPhaser: (id: string | null) => void;
}

export const TimelineResourcePanel = (props: ResourcePanelProps) => {
  const { compileResult, selectedPhaser, onSelectPhaser } = props;
  const phasers = compileResult?.phasers || [];

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
            PHASERS
          </div>
          <div className="flex flex-col gap-1">
            {phasers.map((p) => (
              <Button
                key={`res-phaser-${p.id}`}
                variant="ghost"
                onClick={() => onSelectPhaser(p.id)}
                className={cn(
                  "group flex h-auto items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-xs transition-all duration-150",
                  selectedPhaser === p.id
                    ? "border-indigo-500/50 bg-indigo-500/20 text-indigo-300 shadow-sm hover:bg-indigo-500/30 hover:text-indigo-200"
                    : "border-transparent bg-zinc-800/30 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                )}
              >
                <span className="truncate">{p.name}</span>
                <span
                  className={cn(
                    "text-[10px] opacity-0 transition-opacity group-hover:opacity-100",
                    selectedPhaser === p.id ? "text-indigo-400" : "text-zinc-500",
                  )}
                >
                  Select
                </span>
              </Button>
            ))}
            {phasers.length === 0 && (
              <div className="px-2 text-xs text-zinc-600 italic">No phasers found in DSL</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
