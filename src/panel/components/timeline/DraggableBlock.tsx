import React, { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { UITimelineEvent } from "../../types";
import { AnimationEditor } from "./AnimationEditor";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FromTo } from "@/bridge/types";
import { useTimelineActions } from "@/panel/context/TimelineContext";

interface BlockProps {
  event: UITimelineEvent;
  beatWidth: number;
  isSubTrack?: boolean;
}

export const DraggableBlock = (props: BlockProps) => {
  const { event, beatWidth, isSubTrack } = props;

  const actions = useTimelineActions();

  const ref = useRef<HTMLDivElement>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const left = event.beat * beatWidth;
  const duration = event.duration || 4;
  const width = Math.max(beatWidth * 0.5, duration * beatWidth);

  const isPhaser = event.action.type === "phaser";
  const isAnimate = event.action.type === "animate";

  let label = event.action.type as string;
  if (event.action.type === "phaser") label = event.action.phaser;
  else if (event.action.type === "animate") {
    const parts = event.action.target.split(".");
    label = parts[parts.length - 1]; // e.g. "multiplier"
  }

  // Extract from/to from keyframes. Default to 0 -> 1
  let fromValue: FromTo = 0;
  let toValue: FromTo = 1;
  let easing = "linear";

  if (isAnimate && event.action.type === "animate") {
    fromValue = event.action.from !== undefined ? event.action.from : 0;
    toValue = event.action.to !== undefined ? event.action.to : 1;
    easing = event.action.easing || "linear";
  }

  const handleClick = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (isAnimate) {
      setIsEditorOpen(true);
    }
  };

  const handleDoubleClick = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    actions.onDelete(event.originalIndex);
  };

  return (
    <Popover open={isEditorOpen} onOpenChange={setIsEditorOpen}>
      <PopoverTrigger
        render={
          <div
            ref={ref}
            className={cn(
              "group absolute flex cursor-grab items-center overflow-hidden rounded border shadow-sm transition-colors active:cursor-grabbing",
              isSubTrack ? "top-1 bottom-1 px-1.5" : "top-1.5 bottom-1.5 px-2",
              !isSubTrack && "backdrop-blur-md",

              isPhaser && "border-indigo-400 bg-indigo-600/80 hover:bg-indigo-500/90",
              isAnimate && "border-amber-500/50 bg-amber-600/50 hover:bg-amber-500/70",
              !isPhaser && !isAnimate && "border-zinc-500 bg-zinc-700/80",
            )}
            style={{
              left,
              width,
              zIndex: isSubTrack ? 5 : 10,
              touchAction: "none",
            }}
            title={
              isAnimate
                ? `${label} (From: ${fromValue} -> To: ${toValue})`
                : `${label} (Beat ${event.beat} - ${event.beat + duration})`
            }
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onPointerDown={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
              actions.onDragStart(ev, event.originalIndex, event.beat);
            }}
          >
            <div className="pointer-events-none flex w-full items-center justify-between overflow-hidden px-1">
              <span className="text-[11px] font-medium text-ellipsis whitespace-nowrap text-white drop-shadow-md">
                {label}
              </span>
              {isAnimate && width > 60 && (
                <span className="ml-2 font-mono text-[10px] tracking-tighter whitespace-nowrap text-amber-200/80">
                  {fromValue} → {toValue}
                </span>
              )}
            </div>

            {/* Resize handle */}
            <div
              className={cn(
                "absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/20",
              )}
              style={{ pointerEvents: "auto", touchAction: "none" }}
              title="Drag to resize"
              onPointerDown={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
                actions.onResizeStart(ev, event.originalIndex, duration);
              }}
            />
          </div>
        }
      />
      {isAnimate && (
        <PopoverContent className="w-64" sideOffset={5}>
          <AnimationEditor
            fromValue={fromValue}
            toValue={toValue}
            easing={easing}
            onSave={(newFrom: FromTo, newTo: FromTo, newEasing: string) => {
              actions.onUpdateAnimation(event.originalIndex, newFrom, newTo, newEasing);
              setIsEditorOpen(false);
            }}
          />
        </PopoverContent>
      )}
    </Popover>
  );
};
