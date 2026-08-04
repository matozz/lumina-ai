import type { ArrangementDocument, ProjectBundle } from "@/bridge/types";
import { Badge } from "@/components/ui/badge";
import type { ArrangementAutomationOption } from "./arrangementTimelineModel";
import { resolveAutomationOption } from "./arrangementTimelineModel";
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
      {arrangement.tracks.map((track) => (
        <div key={track.id}>
          <div className="border-border flex h-16 flex-col justify-center gap-1 border-b px-2">
            <div className="flex items-center gap-1">
              <span className="truncate text-xs font-medium">{track.name}</span>
              <Badge variant="outline" className="ml-auto text-[9px]">
                {track.overlap_policy}
              </Badge>
            </div>
            <ArrangementAutomationMenu
              options={options}
              onSelect={(option) => onAddAutomation(track.id, option)}
            />
          </div>
          {track.automation_lanes?.map((lane) => (
            <div key={lane.id} className="border-border/60 flex h-10 items-center border-b px-2">
              <span className="truncate text-[10px]">
                {resolveAutomationOption(bundle, arrangement, lane.target)?.label ?? lane.id}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
