import { ChevronDown, ChevronRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FullDSL } from "@/bridge/types";
import type { TimelineTrackData } from "../types";
import {
  automationParameterOptions,
  type AutomationParameterOption,
} from "../automationParameters";
import { AutomationParameterMenu } from "./AutomationParameterMenu";

interface TrackHeadersProps {
  tracks: TimelineTrackData[];
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  expandedTracks: Record<string, boolean>;
  setExpandedTracks: (tracks: Record<string, boolean>) => void;
  document: FullDSL | null;
  onAddAutomationLane: (option: AutomationParameterOption) => void;
}

export const TimelineTrackHeaders = (props: TrackHeadersProps) => {
  const { tracks, scrollRef, expandedTracks, setExpandedTracks, document, onAddAutomationLane } =
    props;

  const toggleTrack = (trackId: string) => {
    setExpandedTracks({
      ...expandedTracks,
      [trackId]: !expandedTracks[trackId],
    });
  };

  return (
    <div
      className={cn(
        "z-10 flex w-[clamp(8.5rem,11vw,10rem)] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/40 shadow-[4px_0_12px_rgba(0,0,0,0.1)]",
      )}
      data-layout-region="track-headers"
    >
      <div className={cn("h-7 shrink-0 border-b border-zinc-800/60 bg-zinc-900/60")} />
      <div ref={scrollRef} className={cn("flex-1 overflow-y-hidden")}>
        {tracks.map((t) => {
          const hasSubTracks = t.subTracks && t.subTracks.length > 0;
          const isExpanded = expandedTracks[t.id] || false;
          const availableParameters = automationParameterOptions(document, t.id);

          return (
            <div key={t.id} className="flex flex-col">
              <div
                className={cn(
                  "group relative box-border flex h-10 items-center border-b border-zinc-800/40 px-2 transition-colors motion-reduce:transition-none",
                  hasSubTracks && "cursor-pointer",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  if (hasSubTracks) toggleTrack(t.id);
                }}
              >
                {hasSubTracks ? (
                  <button
                    type="button"
                    className="mr-1 flex size-5 items-center justify-center rounded text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none motion-reduce:transition-none"
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${t.name}`}
                    aria-expanded={isExpanded}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleTrack(t.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      toggleTrack(t.id);
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown size={14} aria-hidden="true" />
                    ) : (
                      <ChevronRight size={14} aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  <span className="mr-1 size-5" aria-hidden="true" />
                )}

                <div
                  className={cn(
                    "mr-2 h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-150",
                    "bg-zinc-700 group-hover:bg-indigo-400",
                  )}
                />
                <span
                  className={cn(
                    "flex-1 truncate text-xs font-medium transition-colors",
                    "text-zinc-400 group-hover:text-zinc-100",
                  )}
                  title={t.name}
                >
                  {t.name}
                </span>
                <AutomationParameterMenu
                  compact
                  label={`Add automation to ${t.name}`}
                  options={availableParameters}
                  onSelect={onAddAutomationLane}
                />
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
        <div className="flex h-10 shrink-0 items-center justify-center border-b border-zinc-800/30">
          <AutomationParameterMenu
            label="Global automation"
            options={automationParameterOptions(document, "global")}
            onSelect={onAddAutomationLane}
          />
        </div>
        <div className="min-h-25 flex-1" />
      </div>
    </div>
  );
};
