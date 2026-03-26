import { Plus } from 'lucide-react';
import { cn } from '../utils/cn';

interface TrackHeadersProps {
  tracks: { name: string; events: any[] }[];
  activeTrackName?: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  globalBeat?: number;
}

export function TimelineTrackHeaders({ tracks, activeTrackName, scrollRef, globalBeat = 0 }: TrackHeadersProps) {
  return (
    <div className={cn("w-36 border-r border-zinc-800 bg-zinc-900/40 flex flex-col shrink-0 z-10 shadow-[4px_0_12px_rgba(0,0,0,0.1)]")}>
      <div className={cn("h-7 border-b border-zinc-800/60 bg-zinc-900/60 shrink-0")} />
      <div ref={scrollRef} className={cn("flex-1 overflow-y-hidden")}>
        {tracks.map(t => {
          const isTrackPlaying = t.events.some(
            (e) => globalBeat >= e.beat && globalBeat < e.beat + (e.duration || 4)
          );

          return (
            <div 
              key={t.name} 
              className={cn(
                "h-12 border-b border-zinc-800/40 flex items-center px-3 group relative transition-colors box-border"
              )}
              style={{ backgroundColor: activeTrackName === t.name ? 'rgba(99, 102, 241, 0.08)' : 'transparent' }}
            >
              <div className={cn(
                "w-1.5 h-1.5 rounded-full mr-2 transition-all duration-150",
                isTrackPlaying 
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" 
                  : "bg-zinc-700 group-hover:bg-indigo-400"
              )} />
              <span className={cn(
                "text-xs font-medium transition-colors truncate",
                isTrackPlaying ? "text-emerald-400" : "text-zinc-400 group-hover:text-zinc-100"
              )} title={t.name}>
                {t.name.replace('Phaser: ', '').replace('Preset: ', '')}
              </span>
            </div>
          );
        })}
        <button className={cn(
          "h-10 w-full shrink-0 border-b border-zinc-800/30 flex items-center justify-center gap-1.5",
          "text-[11px] font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition-colors"
        )}>
          <Plus className="w-3.5 h-3.5" /> Add Track
        </button>
        <div className="flex-1 min-h-25" />
      </div>
    </div>
  );
}
