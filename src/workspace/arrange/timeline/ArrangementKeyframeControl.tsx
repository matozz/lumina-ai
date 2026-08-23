import { useRef } from "react";
import type { ArrangementDocument, KeyframeDSL, ParameterDefinitionDSL } from "@/bridge/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
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
  onChooseNearby: (keyframeId: string) => void;
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
  onChooseNearby,
  onStartMove,
  onUpdate,
  rowHeight,
  selected,
  valueInset,
}: ArrangementKeyframeControlProps) {
  const bounds = keyframeMoveBounds(keyframes, new Set([keyframe.id]));
  const nearby = nearbyAutomationKeyframes(
    keyframes,
    keyframe,
    definition,
    geometry,
    rowHeight,
    valueInset,
  );
  const pointerRef = useRef<{ clientX: number; clientY: number; moved: boolean } | null>(null);
  const suppressOpenRef = useRef(false);
  return (
    <Popover open={inspectorOpen} onOpenChange={onInspectorOpenChange}>
      <PopoverTrigger
        onClick={(event) => {
          if (!suppressOpenRef.current) return;
          suppressOpenRef.current = false;
          event.preventDefault();
          event.stopPropagation();
          (
            event as React.MouseEvent<HTMLButtonElement> & {
              preventBaseUIHandler?: () => void;
            }
          ).preventBaseUIHandler?.();
        }}
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
            title={
              nearby.length > 1 ? `${nearby.length} nearby points · click to choose` : undefined
            }
            data-keyframe-id={keyframe.id}
            data-keyframe-color={
              keyframe.value.type === "color" ? keyframe.value.value.toUpperCase() : undefined
            }
            onPointerDown={(event) => {
              pointerRef.current = {
                clientX: event.clientX,
                clientY: event.clientY,
                moved: false,
              };
              suppressOpenRef.current = false;
              onStartMove(event);
            }}
            onPointerMove={(event) => {
              const pointer = pointerRef.current;
              if (
                pointer &&
                (Math.abs(event.clientX - pointer.clientX) > 3 ||
                  Math.abs(event.clientY - pointer.clientY) > 3)
              ) {
                pointer.moved = true;
              }
            }}
            onPointerUp={() => {
              suppressOpenRef.current = pointerRef.current?.moved ?? false;
              pointerRef.current = null;
            }}
            onPointerCancel={() => {
              pointerRef.current = null;
              suppressOpenRef.current = false;
            }}
          />
        }
      />
      <PopoverContent className="w-72" sideOffset={8}>
        {nearby.length > 1 && (
          <div className="flex flex-col gap-2 pb-3">
            <p className="text-muted-foreground text-xs">
              {nearby.length} nearby points · choose one to edit
            </p>
            <div className="flex flex-wrap gap-1">
              {nearby.map((candidate, index) => (
                <Button
                  key={candidate.id}
                  size="xs"
                  variant={candidate.id === keyframe.id ? "secondary" : "outline"}
                  aria-pressed={candidate.id === keyframe.id}
                  onClick={() => onChooseNearby(candidate.id)}
                >
                  {nearbyKeyframeLabel(candidate, index)}
                </Button>
              ))}
            </div>
            <Separator />
          </div>
        )}
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

export function nearbyAutomationKeyframes(
  keyframes: KeyframeDSL[],
  keyframe: KeyframeDSL,
  definition: ParameterDefinitionDSL,
  geometry: TimelineGeometry,
  rowHeight: number,
  valueInset: number,
) {
  const x = ticksToPixels(keyframe.time_tick, geometry);
  const y = keyframeValueY(keyframe.value, definition, rowHeight, valueInset);
  return keyframes.filter((candidate) => {
    const candidateX = ticksToPixels(candidate.time_tick, geometry);
    const candidateY = keyframeValueY(candidate.value, definition, rowHeight, valueInset);
    return Math.abs(candidateX - x) <= 10 && Math.abs(candidateY - y) <= 10;
  });
}

function nearbyKeyframeLabel(keyframe: KeyframeDSL, index: number) {
  const value =
    keyframe.value.type === "scalar"
      ? keyframe.value.value.toFixed(2)
      : keyframe.value.type === "color"
        ? keyframe.value.value.toUpperCase()
        : keyframe.value.type === "direction"
          ? keyframe.value.value
          : keyframe.value.type === "boolean"
            ? String(keyframe.value.value)
            : keyframe.value.value;
  return `${index + 1} · ${keyframe.time_tick} t · ${value}`;
}
