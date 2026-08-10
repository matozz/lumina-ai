import { Trash2 } from "lucide-react";
import type { ArrangementDocument, ProjectBundle } from "@/bridge/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ArrangementAutomationOption } from "./arrangementTimelineModel";
import { cueTrackVisualLayout, resolveAutomationOption } from "./arrangementTimelineModel";
import { ArrangementAutomationMenu } from "./ArrangementAutomationMenu";

interface ArrangementTrackHeadersProps {
  arrangement: ArrangementDocument;
  bundle: ProjectBundle;
  headersRef: React.RefObject<HTMLDivElement | null>;
  onAddAutomation: (trackId: string, option: ArrangementAutomationOption) => void;
  onDeleteAutomationLane: (trackId: string, laneId: string) => void;
  options: ArrangementAutomationOption[];
  width: number;
}

export function ArrangementTrackHeaders({
  arrangement,
  bundle,
  headersRef,
  onAddAutomation,
  onDeleteAutomationLane,
  options,
  width,
}: ArrangementTrackHeadersProps) {
  return (
    <div
      ref={headersRef}
      className="border-border bg-card shrink-0 overflow-hidden border-r"
      style={{ width }}
      aria-label="Arrangement track headers"
    >
      <div className="border-border flex h-8 items-center border-b px-2 text-[10px] font-medium">
        TRACKS
      </div>
      {arrangement.tracks.map((track) => {
        const clips = track.clips ?? [];
        const layout = cueTrackVisualLayout(clips);
        return (
          <div key={track.id}>
            <div
              className="border-border flex items-center border-b px-2"
              style={{ height: layout.height }}
            >
              <div className="flex w-full items-center gap-1">
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                  <span className="truncate text-xs leading-none font-medium">Cues</span>
                  <span className="text-muted-foreground truncate text-[10px] leading-none">
                    {countLabel(clips.length, "CueClip")} ·{" "}
                    {countLabel(layout.layerCount, "clip layer")} ·{" "}
                    {countLabel(layout.rowCount, "visual row")}
                  </span>
                </div>
                <ArrangementAutomationMenu
                  options={options}
                  onSelect={(option) => onAddAutomation(track.id, option)}
                />
              </div>
            </div>
            {track.automation_lanes?.map((lane) => {
              const label =
                resolveAutomationOption(bundle, arrangement, lane.target)?.label ??
                "Unavailable automation";
              return (
                <div key={lane.id} className="border-border/60 flex h-8 items-center border-b px-2">
                  <Tooltip>
                    <TooltipTrigger
                      render={<span className="min-w-0 flex-1 truncate text-[10px]" />}
                    >
                      {label}
                    </TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground ml-1 size-6 shrink-0"
                    aria-label={`Delete ${label} automation lane`}
                    onClick={() => onDeleteAutomationLane(track.id, lane.id)}
                  >
                    <Trash2 className="size-3" aria-hidden="true" />
                  </Button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function countLabel(count: number, label: string) {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}
