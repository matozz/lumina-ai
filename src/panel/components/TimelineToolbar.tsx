import { AudioWaveform, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEngineStore, engineSelectors } from "@/stores/engine";
import { formatMusicalPosition, formatSeconds, ticksToSeconds } from "../musicalTimeDisplay";
import { MAX_BEAT_WIDTH, MIN_BEAT_WIDTH } from "../timelineGeometry";

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  onUndo: () => void;
  onRedo: () => void;
  beatWidth: number;
  snapBeats: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export const TimelineToolbar = (props: ToolbarProps) => {
  const { canUndo, canRedo, isDirty, onUndo, onRedo, beatWidth, snapBeats, onZoomIn, onZoomOut } =
    props;
  const globalBeat = useEngineStore(engineSelectors.globalBeat);
  const document = useEngineStore(engineSelectors.parsedDsl);
  const ppq = document?.timeline?.ppq ?? 960;
  const tempoMap = document?.timeline?.tempo_map ?? { points: [{ time_tick: 0, bpm: 120 }] };
  const globalTick = Math.max(0, Math.round(globalBeat * ppq));
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
        <div className="flex items-center gap-1" aria-label="Timeline zoom and grid snap">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onZoomOut}
            disabled={beatWidth <= MIN_BEAT_WIDTH}
            aria-label="Zoom timeline out"
          >
            <ZoomOut />
          </Button>
          <span className="min-w-14 text-center font-mono text-[9px] text-zinc-500">
            SNAP {formatSnapBeats(snapBeats)}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onZoomIn}
            disabled={beatWidth >= MAX_BEAT_WIDTH}
            aria-label="Zoom timeline in"
          >
            <ZoomIn />
          </Button>
        </div>
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
          <span className="font-mono text-[11px] tracking-wider text-zinc-400">TIME</span>
          <span
            className="font-mono text-xs font-medium text-zinc-100"
            aria-label="Musical position"
          >
            {formatMusicalPosition(globalTick, ppq)}
          </span>
          <span className="font-mono text-[10px] text-zinc-500" aria-label="Timeline seconds">
            {formatSeconds(ticksToSeconds(globalTick, ppq, tempoMap))}
          </span>
        </div>
      </div>
    </div>
  );
};

function formatSnapBeats(beats: number) {
  if (beats === 0.25) return "1/4";
  if (beats === 0.5) return "1/2";
  return `${beats}`;
}
