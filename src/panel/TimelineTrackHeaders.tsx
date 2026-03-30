import { Plus, ChevronDown, ChevronRight, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from "@/components/ui/button";

interface TrackHeadersProps {
  tracks: { name: string; events: any[]; subTracks?: { name: string, events: any[] }[] }[];
  activeTrackName?: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  globalBeat?: number;
  expandedTracks: Record<string, boolean>;
  setExpandedTracks: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

export function TimelineTrackHeaders({ tracks, activeTrackName, scrollRef, globalBeat = 0, expandedTracks, setExpandedTracks }: TrackHeadersProps) {

  const toggleTrack = (trackName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTracks(prev => ({
      ...prev,
      [trackName]: !prev[trackName]
    }));
  };

  return (
    <div className={cn("w-40 border-r border-zinc-800 bg-zinc-900/40 flex flex-col shrink-0 z-10 shadow-[4px_0_12px_rgba(0,0,0,0.1)]")}>
      <div className={cn("h-7 border-b border-zinc-800/60 bg-zinc-900/60 shrink-0")} />
      <div ref={scrollRef} className={cn("flex-1 overflow-y-hidden")}>
        {tracks.map(t => {
          const isTrackPlaying = t.events.some(
            (e) => globalBeat >= e.beat && globalBeat < e.beat + (e.duration || 4)
          );
          
          const hasSubTracks = t.subTracks && t.subTracks.length > 0;
          const isExpanded = expandedTracks[t.name] || false;

          return (
            <div key={t.name} className="flex flex-col">
              <div 
                className={cn(
                  "h-10 border-b border-zinc-800/40 flex items-center px-2 group relative transition-colors box-border cursor-pointer"
                )}
                onClick={(e) => hasSubTracks && toggleTrack(t.name, e)}
                style={{ backgroundColor: activeTrackName === t.name ? 'rgba(99, 102, 241, 0.08)' : 'transparent' }}
              >
                <div className="w-4 h-4 flex items-center justify-center mr-1 text-zinc-500 hover:text-zinc-300 transition-colors">
                  {hasSubTracks ? (
                    isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                  ) : null}
                </div>
                
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full mr-2 transition-all duration-150 shrink-0",
                  isTrackPlaying 
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" 
                    : "bg-zinc-700 group-hover:bg-indigo-400"
                )} />
                <span className={cn(
                  "text-xs font-medium transition-colors truncate flex-1",
                  isTrackPlaying ? "text-emerald-400" : "text-zinc-400 group-hover:text-zinc-100"
                )} title={t.name}>
                  {t.name.replace('Phaser: ', '')}
                </span>
                {t.name === 'Global' && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-zinc-800 text-[9px] font-bold text-zinc-500 uppercase tracking-wider shrink-0">
                    Master
                  </span>
                )}
              </div>
              
              {/* Render Animation Sub-tracks */}
              {isExpanded && hasSubTracks && t.subTracks!.map(st => (
                <div 
                  key={`${t.name}-${st.name}`}
                  className={cn(
                    "h-8 border-b border-zinc-800/20 flex items-center pl-8 pr-2 group relative transition-colors box-border bg-black/20"
                  )}
                >
                  <Play className="w-2.5 h-2.5 text-zinc-600 mr-2" />
                  <span className="text-[10px] font-medium text-zinc-500 truncate" title={st.name}>
                    {st.name}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
        <Button 
          variant="ghost"
          className={cn(
            "h-10 w-full shrink-0 border-b border-zinc-800/30 flex items-center justify-center gap-1.5 rounded-none",
            "text-[11px] font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition-colors"
          )}>
          <Plus className="w-3.5 h-3.5" /> Add Track
        </Button>
        <div className="flex-1 min-h-25" />
      </div>
    </div>
  );
}
