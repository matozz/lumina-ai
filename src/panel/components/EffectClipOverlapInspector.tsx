import { Scissors, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PopoverDescription, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { clipOverlapPlan } from "@/document/clipOverlapPlan";
import { engineSelectors, useEngineStore } from "@/stores/engine";
import { useTimelineActions } from "../context/TimelineContext";
import type { UITimelineEvent } from "../types";

interface EffectClipOverlapInspectorProps {
  event: UITimelineEvent;
  onApplied: () => void;
}

export const EffectClipOverlapInspector = ({
  event,
  onApplied,
}: EffectClipOverlapInspectorProps) => {
  const document = useEngineStore(engineSelectors.parsedDsl);
  const actions = useTimelineActions();
  const plan =
    event.source_track_id && event.source_item_id
      ? clipOverlapPlan(document, event.source_track_id, event.source_item_id)
      : null;
  const overlapCount = plan?.overlappingClipIds.length ?? 0;

  return (
    <div
      className="flex flex-col gap-3"
      onClick={(mouseEvent) => mouseEvent.stopPropagation()}
      onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
    >
      <PopoverHeader>
        <PopoverTitle>EffectClip overlap</PopoverTitle>
        <PopoverDescription>
          Track policy: {plan?.track.overlap_policy ?? "unknown"}. Changes apply only after
          confirmation and can be undone.
        </PopoverDescription>
      </PopoverHeader>

      {overlapCount === 0 ? (
        <p className="text-muted-foreground text-xs" aria-live="polite">
          No overlapping clips. The current clip remains unchanged.
        </p>
      ) : (
        <div className="flex flex-col gap-3 text-xs">
          <div className="flex flex-col gap-1">
            <span className="font-medium">Trim preview</span>
            <span className="text-muted-foreground">
              {plan?.trim
                ? `Keep ticks ${plan.trim.startTick}–${plan.trim.startTick + plan.trim.durationTick}; source offset ${plan.trim.sourceOffsetTick}.`
                : "Overlaps cover the entire clip; no valid trim remains."}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!plan?.trim}
              onClick={() => {
                actions.onTrimClipOverlaps(event.originalIndex);
                onApplied();
              }}
            >
              <Scissors data-icon="inline-start" /> Apply trim
            </Button>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium">Replace preview</span>
            <span className="text-muted-foreground">
              Delete {overlapCount} overlapping clip{overlapCount === 1 ? "" : "s"}:{" "}
              {plan?.overlappingClipIds.join(", ")}.
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                actions.onReplaceClipOverlaps(event.originalIndex);
                onApplied();
              }}
            >
              <Trash2 data-icon="inline-start" /> Replace overlaps
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
