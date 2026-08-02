import type { PointerEvent as ReactPointerEvent } from "react";
import type { KeyframeDSL, ParameterDefinitionDSL, TempoMapDSL } from "@/bridge/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { TimelineActions } from "../context/TimelineContext";
import { BEAT_WIDTH } from "../context/TimelineContext";
import { keyframeMoveBounds, keyframeTransform, keyframeValueY } from "../keyframeGeometry";
import { AutomationKeyframeInspector } from "./AutomationKeyframeInspector";

interface AutomationKeyframeControlProps {
  actions: TimelineActions;
  definition: ParameterDefinitionDSL;
  inspectorOpen: boolean;
  keyframe: KeyframeDSL;
  keyframes: KeyframeDSL[];
  laneId: string;
  onElement: (element: HTMLElement | null) => void;
  onInspectorOpenChange: (open: boolean) => void;
  onSelectionChange: (selection: Set<string>) => void;
  onStartMove: (pointerEvent: ReactPointerEvent, selection: Set<string>) => void;
  ppq: number;
  selectedIds: ReadonlySet<string>;
  tempoMap: TempoMapDSL;
  trackId: string;
}

const ROW_HEIGHT = 32;

export const AutomationKeyframeControl = ({
  actions,
  definition,
  inspectorOpen,
  keyframe,
  keyframes,
  laneId,
  onElement,
  onInspectorOpenChange,
  onSelectionChange,
  onStartMove,
  ppq,
  selectedIds,
  tempoMap,
  trackId,
}: AutomationKeyframeControlProps) => {
  const selected = selectedIds.has(keyframe.id);
  const bounds = keyframeMoveBounds(keyframes, new Set([keyframe.id]));

  return (
    <Popover open={inspectorOpen} onOpenChange={onInspectorOpenChange}>
      <PopoverTrigger
        render={
          <Button
            ref={onElement}
            variant={selected ? "default" : "secondary"}
            size="icon-xs"
            className={cn(
              "absolute z-10 size-4 rounded-sm border shadow-sm will-change-transform",
              selected && "ring-primary/40 ring-2",
            )}
            style={{
              left: (keyframe.time_tick / ppq) * BEAT_WIDTH,
              top: keyframeValueY(keyframe.value, definition, ROW_HEIGHT),
              transform: keyframeTransform(0),
            }}
            aria-label={`${definition.name} keyframe at tick ${keyframe.time_tick}`}
            aria-pressed={selected}
            onPointerDown={(pointerEvent) => {
              pointerEvent.preventDefault();
              pointerEvent.stopPropagation();
              pointerEvent.currentTarget.focus();
              const nextSelection = pointerEvent.shiftKey
                ? toggleSelection(selectedIds, keyframe.id)
                : selected
                  ? new Set(selectedIds)
                  : new Set([keyframe.id]);
              onSelectionChange(nextSelection);
              onStartMove(pointerEvent, nextSelection);
            }}
            onDoubleClick={(mouseEvent) => {
              mouseEvent.preventDefault();
              mouseEvent.stopPropagation();
            }}
            onKeyDown={(keyboardEvent) => {
              if (keyboardEvent.key !== "Delete" && keyboardEvent.key !== "Backspace") return;
              keyboardEvent.preventDefault();
              keyboardEvent.stopPropagation();
              const ids = selected ? Array.from(selectedIds) : [keyframe.id];
              if (ids.length < keyframes.length) {
                actions.onDeleteKeyframes(trackId, laneId, ids);
                onSelectionChange(new Set());
              }
            }}
          />
        }
      />
      <PopoverContent className="w-72" sideOffset={8}>
        <AutomationKeyframeInspector
          key={keyframe.id}
          canDelete={keyframes.length > 1}
          definition={definition}
          keyframe={keyframe}
          minimumTick={keyframe.time_tick + bounds.minimum}
          maximumTick={keyframe.time_tick + bounds.maximum}
          ppq={ppq}
          tempoMap={tempoMap}
          onApply={(changes) => {
            actions.onUpdateKeyframe(trackId, laneId, keyframe.id, changes);
            onInspectorOpenChange(false);
          }}
          onDelete={() => {
            actions.onDeleteKeyframes(trackId, laneId, [keyframe.id]);
            onSelectionChange(new Set());
            onInspectorOpenChange(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
};

function toggleSelection(selected: ReadonlySet<string>, id: string) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next.size > 0 ? next : new Set([id]);
}
