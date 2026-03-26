import { Plus } from 'lucide-react';
import { cn } from '../utils/cn';

interface TrackHeadersProps {
  tracks: { name: string; events: any[] }[];
  activeTrackName?: string;
}

export function TimelineTrackHeaders({ tracks, activeTrackName }: TrackHeadersProps) {
  return (
    <div className={cn("w-36 border-r border-zinc-800 bg-zinc-900/40 flex flex-col shrink-0 z-10 shadow-[4px_0_12px_rgba(0,0,0,0.1)]")}>
      <div className={cn("h-7 border-b border-zinc-800/60 bg-zinc-900/60")} />
      <div className={cn("flex-1 overflow-y-auto custom-scrollbar pt-px")}>
        {tracks.map(t => (
          <div 
            key={t.name} 
            className={cn(
              "h-12 border-b border-zinc-800/40 flex items-center px-3 group relative transition-colors"
            )}
            style={{ backgroundColor: activeTrackName === t.name ? 'rgba(99, 102, 241, 0.08)' : 'transparent' }}
          >
            <div className={cn("w-1.5 h-1.5 rounded-full bg-zinc-700 mr-2 group-hover:bg-indigo-400 transition-colors")} />
            <span className={cn("text-xs font-medium text-zinc-400 group-hover:text-zinc-100 transition-colors truncate")} title={t.name}>
              {t.name.replace('Phaser: ', '').replace('Preset: ', '')}
            </span>
          </div>
        ))}
        <button className={cn(
          "h-10 w-full border-b border-zinc-800/30 flex items-center justify-center gap-1.5",
          "text-[11px] font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition-colors"
        )}>
          <Plus className="w-3.5 h-3.5" /> Add Track
        </button>
      </div>
    </div>
  );
}
