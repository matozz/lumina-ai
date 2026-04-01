import { AudioWaveform } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolbarProps {
  globalBeat: number;
}

export const TimelineToolbar = (props: ToolbarProps) => {
  const { globalBeat } = props;
  return (
    <div
      className={cn(
        "flex h-10 items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 backdrop-blur-md",
      )}
    >
      <div className="flex items-center gap-3">
        <AudioWaveform className="h-4 w-4 text-indigo-400" />
        <span className="text-xs font-semibold tracking-wide text-zinc-200">SEQUENCER</span>
      </div>
      <div className="flex items-center gap-4">
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
