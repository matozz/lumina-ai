import { AudioWaveform } from 'lucide-react';
import { cn } from '../utils/cn';

interface ToolbarProps {
  globalBeat: number;
}

export function TimelineToolbar({ globalBeat }: ToolbarProps) {
  return (
    <div className={cn(
      "h-10 border-b border-zinc-800 bg-zinc-900/80 flex items-center px-4 justify-between backdrop-blur-md"
    )}>
      <div className="flex items-center gap-3">
        <AudioWaveform className="w-4 h-4 text-indigo-400" />
        <span className="text-xs font-semibold text-zinc-200 tracking-wide">SEQUENCER</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-zinc-950/50 px-2 py-0.5 rounded-md border border-zinc-800 shadow-inner">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[11px] text-zinc-400 font-mono tracking-wider">BEAT</span>
          <span className="text-xs text-zinc-100 font-mono font-medium">
            {globalBeat.toFixed(2).padStart(5, '0')}
          </span>
        </div>
      </div>
    </div>
  );
}
