import type { ArrangementDocument, ProjectBundle } from "@/bridge/types";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ArrangementAutomationOption } from "./arrangementTimelineModel";
import { cueTrackVisualLayout, resolveAutomationOption } from "./arrangementTimelineModel";
import { ArrangementAutomationMenu } from "./ArrangementAutomationMenu";

interface ArrangementTrackHeadersProps {
  arrangement: ArrangementDocument;
  bundle: ProjectBundle;
  headersRef: React.RefObject<HTMLDivElement | null>;
  onAddAutomation: (trackId: string, option: ArrangementAutomationOption) => void;
  options: ArrangementAutomationOption[];
  width: number;
}

export function ArrangementTrackHeaders({
  arrangement,
  bundle,
  headersRef,
  onAddAutomation,
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
              className="border-border flex flex-col gap-1 border-b px-2 py-2"
              style={{ height: layout.height }}
            >
              <div className="flex items-center gap-1">
                <span className="truncate text-xs font-medium">{track.name}</span>
                <Badge variant="outline" className="ml-auto text-[9px]">
                  {track.overlap_policy === "layer" ? "Layered overlap" : "No overlap"}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-[10px]">
                  {countLabel(clips.length, "CueClip")} ·{" "}
                  {countLabel(layout.layerCount, "clip layer")} ·{" "}
                  {countLabel(layout.rowCount, "visual row")}
                </span>
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
                    <TooltipTrigger render={<span className="min-w-0 truncate text-[10px]" />}>
                      {label}
                    </TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
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
