import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useEngineStore } from "@/stores/engine";
import type { TimelineViewport } from "../virtualization";
import { pixelsToTicks, snapTick, ticksToPixels, type TimelineGeometry } from "../timelineGeometry";

interface GridProps {
  geometry: TimelineGeometry;
  viewport: TimelineViewport;
  maxBeat: number;
  onSeek: (beat: number) => void;
}

export const TimelineGrid = ({ geometry, viewport, maxBeat, onSeek }: GridProps) => {
  const { beatWidth } = geometry;
  const rulerRef = useRef<HTMLDivElement>(null);
  const snapWidth = ticksToPixels(geometry.snapTicks, geometry);
  const firstBarBeat = Math.max(0, Math.floor(viewport.startBeat / 4) * 4);
  const lastBarBeat = Math.ceil(viewport.endBeat / 4) * 4;
  const labels = Array.from(
    { length: Math.max(0, (lastBarBeat - firstBarBeat) / 4 + 1) },
    (_, index) => firstBarBeat + index * 4,
  );

  useEffect(() => {
    const updateAccessibleValue = (beat: number) => {
      rulerRef.current?.setAttribute("aria-valuenow", String(beat));
      rulerRef.current?.setAttribute("aria-valuetext", `Beat ${formatBeat(beat)}`);
      rulerRef.current?.setAttribute("aria-valuemax", String(Math.max(maxBeat, beat)));
    };
    updateAccessibleValue(useEngineStore.getState().globalBeat);
    return useEngineStore.subscribe((state) => updateAccessibleValue(state.globalBeat));
  }, [maxBeat]);

  const seekFromClientX = (clientX: number, ruler: HTMLDivElement) => {
    const x = clientX - ruler.getBoundingClientRect().left;
    const tick = snapTick(pixelsToTicks(x, geometry), geometry);
    onSeek(tick / geometry.ppq);
  };

  const handleSeekKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentBeat = useEngineStore.getState().globalBeat;
    const snapBeats = geometry.snapTicks / geometry.ppq;
    let nextBeat: number | null = null;
    if (event.key === "Home") nextBeat = 0;
    else if (event.key === "End") nextBeat = Math.max(maxBeat, currentBeat);
    else if (event.key === "ArrowLeft") {
      nextBeat = currentBeat - (event.shiftKey ? 4 : snapBeats);
    } else if (event.key === "ArrowRight") {
      nextBeat = currentBeat + (event.shiftKey ? 4 : snapBeats);
    }
    if (nextBeat === null) return;
    event.preventDefault();
    onSeek(Math.max(0, Math.min(Math.max(maxBeat, currentBeat), nextBeat)));
  };

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            "linear-gradient(to right, rgba(63,63,70,0.4) 1px, transparent 1px)",
            "linear-gradient(to right, rgba(39,39,42,0.3) 1px, transparent 1px)",
            "linear-gradient(to right, rgba(39,39,42,0.18) 1px, transparent 1px)",
          ].join(","),
          backgroundSize: `${beatWidth * 4}px 100%, ${beatWidth}px 100%, ${snapWidth}px 100%`,
        }}
        data-snap-ticks={geometry.snapTicks}
        data-snap-width={snapWidth}
      />

      <div
        ref={rulerRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek timeline"
        aria-valuemin={0}
        aria-valuemax={maxBeat}
        aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Home End"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          seekFromClientX(event.clientX, event.currentTarget);
        }}
        onKeyDown={handleSeekKeyDown}
        className={cn(
          "sticky top-0 z-10 h-7 cursor-col-resize border-b border-zinc-800/60 bg-zinc-900/80 shadow-sm backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:outline-none focus-visible:ring-inset",
        )}
      >
        {labels.map((beat) => (
          <div
            key={beat}
            data-bar-beat={beat}
            className="absolute pt-1.5 pl-1.5 font-mono text-[10px] text-zinc-500 select-none"
            style={{ left: beat * beatWidth }}
          >
            {beat}
          </div>
        ))}
      </div>
    </>
  );
};

function formatBeat(beat: number) {
  return Number.isInteger(beat) ? beat.toFixed(0) : beat.toFixed(3).replace(/0+$/, "");
}
