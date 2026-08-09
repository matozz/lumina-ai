import type { ArrangementDocument, KeyframeDSL, ParameterDefinitionDSL } from "@/bridge/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AutomationKeyframeInspector } from "@/panel/components/AutomationKeyframeInspector";
import { keyframeMoveBounds, keyframeTransform, keyframeValueY } from "@/panel/keyframeGeometry";
import { ticksToPixels, type TimelineGeometry } from "@/panel/timelineGeometry";

interface ArrangementKeyframeControlProps {
  arrangement: ArrangementDocument;
  definition: ParameterDefinitionDSL;
  inspectorOpen: boolean;
  keyframe: KeyframeDSL;
  keyframes: KeyframeDSL[];
  onDelete: () => void;
  onElement: (element: HTMLButtonElement | null) => void;
  onInspectorOpenChange: (open: boolean) => void;
  onStartMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onUpdate: (changes: Partial<Pick<KeyframeDSL, "time_tick" | "value" | "interpolation">>) => void;
  rowHeight: number;
  selected: boolean;
  valueInset: number;
  geometry: TimelineGeometry;
}

export function ArrangementKeyframeControl({
  arrangement,
  definition,
  geometry,
  inspectorOpen,
  keyframe,
  keyframes,
  onDelete,
  onElement,
  onInspectorOpenChange,
  onStartMove,
  onUpdate,
  rowHeight,
  selected,
  valueInset,
}: ArrangementKeyframeControlProps) {
  const bounds = keyframeMoveBounds(keyframes, new Set([keyframe.id]));
  return (
    <Popover open={inspectorOpen} onOpenChange={onInspectorOpenChange}>
      <PopoverTrigger
        render={
          <Button
            ref={onElement}
            size="icon-xs"
            variant="default"
            className={cn(
              "border-primary-foreground/20 absolute z-10 size-2.5 touch-none rounded-full border shadow-sm will-change-transform",
              !selected && "bg-primary/80 hover:bg-primary",
              selected && "ring-primary/40 ring-2",
            )}
            style={{
              left: ticksToPixels(keyframe.time_tick, geometry),
              top: keyframeValueY(keyframe.value, definition, rowHeight, valueInset),
              transform: keyframeTransform(0),
              backgroundColor: keyframe.value.type === "color" ? keyframe.value.value : undefined,
            }}
            aria-label={`${definition.name} keyframe at tick ${keyframe.time_tick}${
              keyframe.value.type === "color" ? `, ${keyframe.value.value.toUpperCase()}` : ""
            }`}
            aria-pressed={selected}
            data-keyframe-id={keyframe.id}
            data-keyframe-color={
              keyframe.value.type === "color" ? keyframe.value.value.toUpperCase() : undefined
            }
            onPointerDown={onStartMove}
          />
        }
      />
      <PopoverContent className="w-72" sideOffset={8}>
        <AutomationKeyframeInspector
          canDelete={keyframes.length > 1}
          definition={definition}
          keyframe={keyframe}
          minimumTick={keyframe.time_tick + bounds.minimum}
          maximumTick={Math.min(arrangement.length_ticks - 1, keyframe.time_tick + bounds.maximum)}
          ppq={arrangement.ppq}
          tempoMap={arrangement.tempo_map}
          timeSignatures={arrangement.time_signatures}
          onApply={onUpdate}
          onDelete={onDelete}
        />
      </PopoverContent>
    </Popover>
  );
}
