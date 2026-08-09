import { useEffect, useMemo, useRef } from "react";
import type { ArrangementDocument } from "@/bridge/types";
import { rulerMarks } from "@/authoring/musicalTime";
import { authoringTransportActions, useAuthoringTransportStore } from "@/authoring/transport";
import {
  pixelsToTicks,
  snapTick,
  ticksToPixels,
  type TimelineGeometry,
} from "@/panel/timelineGeometry";
import type { TimelineViewport } from "@/panel/virtualization";

interface ArrangementRulerProps {
  arrangement: ArrangementDocument;
  geometry: TimelineGeometry;
  sessionKey: string;
  viewport: TimelineViewport;
}

export function ArrangementRuler({
  arrangement,
  geometry,
  sessionKey,
  viewport,
}: ArrangementRulerProps) {
  const rulerRef = useRef<HTMLDivElement>(null);
  const marks = useMemo(() => {
    const density = arrangementGridDensity(geometry.beatWidth);
    return rulerMarks(
      arrangement.ppq,
      arrangement.time_signatures,
      viewport.startBeat * arrangement.ppq,
      Math.min(arrangement.length_ticks, viewport.endBeat * arrangement.ppq),
    ).filter((mark) =>
      mark.isBar ? (mark.bar - 1) % density.barStride === 0 : density.showBeatLabels,
    );
  }, [arrangement, geometry.beatWidth, viewport.endBeat, viewport.startBeat]);

  useEffect(() => {
    const update = () => {
      const tick = useAuthoringTransportStore.getState().sessions[sessionKey]?.cursorTick ?? 0;
      rulerRef.current?.setAttribute("aria-valuenow", String(tick));
      rulerRef.current?.setAttribute("aria-valuetext", `Tick ${tick}`);
    };
    update();
    return useAuthoringTransportStore.subscribe(update);
  }, [sessionKey]);

  const seekClientX = (clientX: number) => {
    const ruler = rulerRef.current;
    if (!ruler) return;
    const tick = snapTick(
      pixelsToTicks(clientX - ruler.getBoundingClientRect().left, geometry),
      geometry,
    );
    authoringTransportActions.seek(sessionKey, Math.min(arrangement.length_ticks, tick));
  };

  return (
    <div
      ref={rulerRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek Arrangement timeline"
      aria-valuemin={0}
      aria-valuemax={arrangement.length_ticks}
      aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Home End"
      className="border-border bg-card/95 sticky top-0 z-30 h-8 cursor-col-resize border-b shadow-sm backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-inset"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        seekClientX(event.clientX);
      }}
      onKeyDown={(event) => {
        const current = useAuthoringTransportStore.getState().sessions[sessionKey]?.cursorTick ?? 0;
        let next: number | undefined;
        if (event.key === "Home") next = 0;
        else if (event.key === "End") next = arrangement.length_ticks;
        else if (event.key === "ArrowLeft") {
          next = current - (event.shiftKey ? arrangement.ppq : geometry.snapTicks);
        } else if (event.key === "ArrowRight") {
          next = current + (event.shiftKey ? arrangement.ppq : geometry.snapTicks);
        }
        if (next === undefined) return;
        event.preventDefault();
        authoringTransportActions.seek(
          sessionKey,
          Math.max(0, Math.min(arrangement.length_ticks, next)),
        );
      }}
    >
      {marks.map((mark) => (
        <span
          key={mark.timeTick}
          className="text-muted-foreground absolute top-1 font-mono text-[9px] tabular-nums"
          style={{ left: ticksToPixels(mark.timeTick, geometry) + 4 }}
        >
          {mark.isBar ? `${mark.bar}` : `${mark.bar}.${mark.beat}`}
        </span>
      ))}
      {arrangement.tempo_map.points.map((point) => (
        <span
          key={`tempo:${point.time_tick}`}
          className="bg-primary/15 text-primary absolute bottom-0 h-2 border-l text-[0]"
          style={{ left: ticksToPixels(point.time_tick, geometry) }}
          title={`${point.bpm} BPM at tick ${point.time_tick}`}
        />
      ))}
    </div>
  );
}

export function ArrangementGrid({
  arrangement,
  geometry,
  viewport,
}: Omit<ArrangementRulerProps, "sessionKey">) {
  const marks = useMemo(() => {
    const density = arrangementGridDensity(geometry.beatWidth);
    return rulerMarks(
      arrangement.ppq,
      arrangement.time_signatures,
      viewport.startBeat * arrangement.ppq,
      Math.min(arrangement.length_ticks, viewport.endBeat * arrangement.ppq),
    ).filter((mark) =>
      mark.isBar ? (mark.bar - 1) % density.barStride === 0 : density.showBeatGrid,
    );
  }, [arrangement, geometry.beatWidth, viewport.endBeat, viewport.startBeat]);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {marks.map((mark) => (
        <span
          key={mark.timeTick}
          className={
            mark.isBar
              ? "border-border/80 absolute inset-y-0 border-l"
              : "border-border/30 absolute inset-y-0 border-l"
          }
          style={{ left: ticksToPixels(mark.timeTick, geometry) }}
        />
      ))}
    </div>
  );
}

export function arrangementGridDensity(beatWidth: number) {
  if (beatWidth >= 28) return { barStride: 1, showBeatGrid: true, showBeatLabels: true };
  if (beatWidth >= 10) return { barStride: 1, showBeatGrid: false, showBeatLabels: false };
  if (beatWidth >= 4) return { barStride: 4, showBeatGrid: false, showBeatLabels: false };
  if (beatWidth >= 2) return { barStride: 8, showBeatGrid: false, showBeatLabels: false };
  return { barStride: 16, showBeatGrid: false, showBeatLabels: false };
}

export function ArrangementPlayhead({
  geometry,
  sessionKey,
}: Pick<ArrangementRulerProps, "geometry" | "sessionKey">) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      const tick = useAuthoringTransportStore.getState().sessions[sessionKey]?.cursorTick ?? 0;
      if (ref.current) {
        ref.current.style.transform = `translateX(${ticksToPixels(tick, geometry)}px)`;
      }
    };
    update();
    return useAuthoringTransportStore.subscribe(update);
  }, [geometry, sessionKey]);
  return (
    <div
      ref={ref}
      className="bg-primary pointer-events-none absolute inset-y-0 left-0 z-40 w-px will-change-transform"
      aria-hidden="true"
    />
  );
}
