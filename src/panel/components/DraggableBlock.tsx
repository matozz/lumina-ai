import { memo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { UITimelineEvent } from "../types";
import { useTimelineActions } from "@/panel/context/TimelineContext";
import { EffectClipOverlapInspector } from "./EffectClipOverlapInspector";

interface BlockProps {
  event: UITimelineEvent;
  beatWidth: number;
}

export const DraggableBlock = memo(({ event, beatWidth }: BlockProps) => {
  const actions = useTimelineActions();
  const ref = useRef<HTMLDivElement>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  if (event.action.type !== "effect") return null;

  const label = event.action.instance_id;
  const duration = event.duration ?? 4;

  return (
    <Popover open={inspectorOpen} onOpenChange={setInspectorOpen}>
      <PopoverTrigger
        render={
          <div
            ref={ref}
            className={cn(
              "group absolute top-1.5 bottom-1.5 flex cursor-grab items-center overflow-hidden rounded border border-indigo-400 bg-indigo-600/80 px-2 shadow-sm transition-colors hover:bg-indigo-500/90 active:cursor-grabbing",
              "focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none",
            )}
            style={{
              left: event.beat * beatWidth,
              width: Math.max(beatWidth * 0.5, duration * beatWidth),
              zIndex: 10,
              touchAction: "none",
            }}
            title={`${label} (Beat ${event.beat} - ${event.beat + duration})`}
            role="button"
            tabIndex={0}
            aria-label={`${label}, starts at beat ${event.beat}, duration ${duration} beats`}
            onClick={(mouseEvent) => mouseEvent.stopPropagation()}
            onDoubleClick={(mouseEvent) => {
              mouseEvent.stopPropagation();
              actions.onDelete(event.originalIndex);
            }}
            onKeyDown={(keyboardEvent) => {
              if (keyboardEvent.key === "Delete" || keyboardEvent.key === "Backspace") {
                keyboardEvent.preventDefault();
                actions.onDelete(event.originalIndex);
              } else if (keyboardEvent.key === "ArrowLeft" || keyboardEvent.key === "ArrowRight") {
                keyboardEvent.preventDefault();
                const direction = keyboardEvent.key === "ArrowLeft" ? -1 : 1;
                actions.onNudge(
                  event.originalIndex,
                  direction * (keyboardEvent.shiftKey ? 4 : 0.5),
                );
              }
            }}
            onPointerDown={(pointerEvent) => {
              pointerEvent.preventDefault();
              pointerEvent.stopPropagation();
              ref.current?.focus();
              (pointerEvent.target as HTMLElement).setPointerCapture(pointerEvent.pointerId);
              if (ref.current) {
                actions.onDragStart(pointerEvent, event.originalIndex, event.beat, ref.current);
              }
            }}
          >
            <div className="pointer-events-none flex w-full items-center justify-between overflow-hidden px-1">
              <span className="truncate text-[11px] font-medium text-white drop-shadow-md">
                {label}
              </span>
            </div>

            <div
              className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/20"
              style={{ pointerEvents: "auto", touchAction: "none" }}
              title="Drag to resize"
              onPointerDown={(pointerEvent) => {
                pointerEvent.preventDefault();
                pointerEvent.stopPropagation();
                (pointerEvent.target as HTMLElement).setPointerCapture(pointerEvent.pointerId);
                if (ref.current) {
                  actions.onResizeStart(pointerEvent, event.originalIndex, duration, ref.current);
                }
              }}
            />
          </div>
        }
      />
      <PopoverContent className="w-72" sideOffset={8}>
        <EffectClipOverlapInspector event={event} onApplied={() => setInspectorOpen(false)} />
      </PopoverContent>
    </Popover>
  );
});

DraggableBlock.displayName = "DraggableBlock";
