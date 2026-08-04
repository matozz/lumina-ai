import { memo, useEffect, useRef } from "react";
import type { CueClip } from "@/bridge/types";
import { cn } from "@/lib/utils";
import {
  pointerDeltaWithScroll,
  snappedDurationForPointerDelta,
  snappedTickForPointerDelta,
  ticksToPixels,
  type TimelineGeometry,
} from "@/panel/timelineGeometry";

interface CueClipBlockProps {
  arrangementLength: number;
  clip: CueClip;
  cueName: string;
  geometry: TimelineGeometry;
  onCommitMove: (startTick: number) => void;
  onCommitResize: (durationTick: number) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSelect: () => void;
  onSnapPreview: (tick: number | null) => void;
  selected: boolean;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}

interface ClipInteraction {
  currentClientX: number;
  kind: "move" | "resize";
  nextValue: number;
  startClientX: number;
  startScrollLeft: number;
}

export const CueClipBlock = memo(function CueClipBlock({
  arrangementLength,
  clip,
  cueName,
  geometry,
  onCommitMove,
  onCommitResize,
  onDelete,
  onDuplicate,
  onSelect,
  onSnapPreview,
  selected,
  viewportRef,
}: CueClipBlockProps) {
  const elementRef = useRef<HTMLButtonElement>(null);
  const interactionRef = useRef<ClipInteraction | null>(null);
  const frameRef = useRef<number | null>(null);

  const flushPreview = () => {
    frameRef.current = null;
    const interaction = interactionRef.current;
    const element = elementRef.current;
    if (!interaction || !element) return;
    const delta = pointerDeltaWithScroll(
      interaction.startClientX,
      interaction.currentClientX,
      interaction.startScrollLeft,
      viewportRef.current?.scrollLeft ?? interaction.startScrollLeft,
    );
    if (interaction.kind === "move") {
      interaction.nextValue = Math.min(
        Math.max(0, arrangementLength - clip.duration_tick),
        snappedTickForPointerDelta(clip.start_tick, delta, geometry),
      );
      element.style.transform = `translateX(${ticksToPixels(
        interaction.nextValue - clip.start_tick,
        geometry,
      )}px)`;
      onSnapPreview(interaction.nextValue);
      return;
    }
    interaction.nextValue = Math.min(
      arrangementLength - clip.start_tick,
      snappedDurationForPointerDelta(clip.start_tick, clip.duration_tick, delta, geometry),
    );
    element.style.width = `${Math.max(20, ticksToPixels(interaction.nextValue, geometry))}px`;
    onSnapPreview(clip.start_tick + interaction.nextValue);
  };

  const schedulePreview = () => {
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(flushPreview);
  };

  const finish = (commit: boolean) => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      flushPreview();
    }
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (elementRef.current) {
      elementRef.current.style.transform = "";
      elementRef.current.style.width = `${Math.max(
        20,
        ticksToPixels(clip.duration_tick, geometry),
      )}px`;
    }
    onSnapPreview(null);
    if (!commit || !interaction) return;
    if (interaction.kind === "move" && interaction.nextValue !== clip.start_tick) {
      onCommitMove(interaction.nextValue);
    } else if (interaction.kind === "resize" && interaction.nextValue !== clip.duration_tick) {
      onCommitResize(interaction.nextValue);
    }
  };

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const start = (event: React.PointerEvent, kind: ClipInteraction["kind"]) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    elementRef.current?.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      kind,
      startClientX: event.clientX,
      currentClientX: event.clientX,
      startScrollLeft: viewportRef.current?.scrollLeft ?? 0,
      nextValue: kind === "move" ? clip.start_tick : clip.duration_tick,
    };
  };

  return (
    <button
      ref={elementRef}
      type="button"
      className={cn(
        "border-primary/50 bg-primary text-primary-foreground group absolute top-2 h-10 touch-none overflow-hidden rounded-md border px-2 text-left text-[10px] shadow-sm will-change-transform",
        "cursor-grab focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing",
        selected && "ring-primary/40 ring-2",
      )}
      style={{
        left: ticksToPixels(clip.start_tick, geometry),
        width: Math.max(20, ticksToPixels(clip.duration_tick, geometry)),
      }}
      aria-label={`${cueName}, starts at tick ${clip.start_tick}, duration ${clip.duration_tick} ticks`}
      aria-pressed={selected}
      aria-keyshortcuts="ArrowLeft ArrowRight Alt+ArrowLeft Alt+ArrowRight Delete Backspace Control+D Meta+D"
      data-clip-id={clip.id}
      onPointerDown={(event) => start(event, "move")}
      onPointerMove={(event) => {
        if (!interactionRef.current) return;
        interactionRef.current.currentClientX = event.clientX;
        schedulePreview();
      }}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
      onLostPointerCapture={() => {
        if (interactionRef.current) finish(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          onDelete();
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
          event.preventDefault();
          onDuplicate();
          return;
        }
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const delta = direction * (event.shiftKey ? geometry.ppq : geometry.snapTicks);
        if (event.altKey) {
          onCommitResize(
            Math.max(1, Math.min(arrangementLength - clip.start_tick, clip.duration_tick + delta)),
          );
        } else {
          onCommitMove(
            Math.max(0, Math.min(arrangementLength - clip.duration_tick, clip.start_tick + delta)),
          );
        }
      }}
    >
      <span className="pointer-events-none block truncate font-medium">{cueName}</span>
      <span className="pointer-events-none block truncate opacity-75">
        Cue r{clip.cue_ref.revision} · {clip.duration_tick} t
      </span>
      <span
        data-resize-handle
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 transition-colors group-hover:bg-white/15"
        aria-hidden="true"
        onPointerDown={(event) => start(event, "resize")}
      />
    </button>
  );
});
