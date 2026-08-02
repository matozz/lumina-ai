import { AudioWaveform, Redo2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEngineStore, engineSelectors } from "@/stores/engine";

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const TimelineToolbar = (props: ToolbarProps) => {
  const { canUndo, canRedo, isDirty, onUndo, onRedo } = props;
  const globalBeat = useEngineStore(engineSelectors.globalBeat);
  return (
    <div
      className={cn(
        "flex h-10 items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 backdrop-blur-md",
      )}
    >
      <div className="flex items-center gap-3">
        <AudioWaveform className="h-4 w-4 text-indigo-400" />
        <span className="text-xs font-semibold tracking-wide text-zinc-200">SEQUENCER</span>
        <span
          className={cn("text-[10px] text-amber-400", !isDirty && "invisible")}
          aria-live="polite"
        >
          Unsaved
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1" aria-label="Timeline edit history">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo timeline edit"
            aria-keyshortcuts="Control+Z Meta+Z"
            title="Undo (⌘/Ctrl+Z)"
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo timeline edit"
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
            title="Redo (⌘/Ctrl+Shift+Z)"
          >
            <Redo2 />
          </Button>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/50 px-2 py-0.5 shadow-inner">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          <span className="font-mono text-[11px] tracking-wider text-zinc-400">BEAT</span>
          <span className="font-mono text-xs font-medium text-zinc-100">
            {globalBeat.toFixed(2).padStart(5, "0")}
          </span>
        </div>
      </div>
    </div>
  );
};
