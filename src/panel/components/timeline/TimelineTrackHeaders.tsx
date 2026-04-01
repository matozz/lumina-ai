import { Plus, ChevronDown, ChevronRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TimelineTrackData } from "../../types";

interface TrackHeadersProps {
  tracks: TimelineTrackData[];
  activeTrackName?: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  globalBeat?: number;
  expandedTracks: Record<string, boolean>;
  setExpandedTracks: (tracks: Record<string, boolean>) => void;
}

export const TimelineTrackHeaders = (props: TrackHeadersProps) => {
  const {
    tracks,
    activeTrackName,
    scrollRef,
    globalBeat = 0,
    expandedTracks,
    setExpandedTracks,
  } = props;

  const toggleTrack = (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTracks({
      ...expandedTracks,
      [trackId]: !expandedTracks[trackId],
    });
  };

  return (
    <div
      className={cn(
        "z-10 flex w-40 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/40 shadow-[4px_0_12px_rgba(0,0,0,0.1)]",
      )}
    >
      <div className={cn("h-7 shrink-0 border-b border-zinc-800/60 bg-zinc-900/60")} />
      <div ref={scrollRef} className={cn("flex-1 overflow-y-hidden")}>
        {tracks.map((t) => {
          const isTrackPlaying = t.events.some(
            (e) => globalBeat >= e.beat && globalBeat < e.beat + (e.duration || 4),
          );

          const hasSubTracks = t.subTracks && t.subTracks.length > 0;
          const isExpanded = expandedTracks[t.id] || false;

          return (
            <div key={t.id} className="flex flex-col">
              <div
                className={cn(
                  "group relative box-border flex h-10 cursor-pointer items-center border-b border-zinc-800/40 px-2 transition-colors",
                )}
                onClick={(e) => hasSubTracks && toggleTrack(t.id, e)}
                style={{
                  backgroundColor:
                    activeTrackName === t.id ? "rgba(99, 102, 241, 0.08)" : "transparent",
                }}
              >
                <div className="mr-1 flex h-4 w-4 items-center justify-center text-zinc-500 transition-colors hover:text-zinc-300">
                  {hasSubTracks ? (
                    isExpanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )
                  ) : null}
                </div>

                <div
                  className={cn(
                    "mr-2 h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-150",
                    isTrackPlaying
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                      : "bg-zinc-700 group-hover:bg-indigo-400",
                  )}
                />
                <span
                  className={cn(
                    "flex-1 truncate text-xs font-medium transition-colors",
                    isTrackPlaying ? "text-emerald-400" : "text-zinc-400 group-hover:text-zinc-100",
                  )}
                  title={t.name}
                >
                  {t.name}
                </span>
                {t.id === "global" && (
                  <span className="ml-2 shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-zinc-500 uppercase">
                    Master
                  </span>
                )}
              </div>

              {/* Render Animation Sub-tracks */}
              {isExpanded &&
                hasSubTracks &&
                t.subTracks!.map((st) => (
                  <div
                    key={`${t.id}-${st.name}`}
                    className={cn(
                      "group relative box-border flex h-8 items-center border-b border-zinc-800/20 bg-black/20 pr-2 pl-8 transition-colors",
                    )}
                  >
                    <Play className="mr-2 h-2.5 w-2.5 text-zinc-600" />
                    <span
                      className="truncate text-[10px] font-medium text-zinc-500"
                      title={st.name}
                    >
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
            "flex h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-none border-b border-zinc-800/30",
            "text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-800/40 hover:text-zinc-300",
          )}
        >
          <Plus className="h-3.5 w-3.5" /> Add Track
        </Button>
        <div className="min-h-25 flex-1" />
      </div>
    </div>
  );
};
