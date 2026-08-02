import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useEngineStore } from "@/stores/engine";

interface PlayheadProps {
  beatWidth: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export const TimelinePlayhead = ({ beatWidth, scrollRef }: PlayheadProps) => {
  const playheadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let previousBeat = Number.NaN;
    const update = (beat: number) => {
      if (beat === previousBeat) return;
      previousBeat = beat;
      const playheadX = beat * beatWidth;
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translate3d(${playheadX}px, 0, 0)`;
      }
      const container = scrollRef.current;
      if (!container) return;
      if (playheadX > container.scrollLeft + container.clientWidth - 100) {
        container.scrollTo({ left: Math.max(0, playheadX - 100), behavior: "auto" });
      } else if (playheadX < container.scrollLeft) {
        container.scrollTo({ left: Math.max(0, playheadX - 100), behavior: "auto" });
      }
    };
    update(useEngineStore.getState().globalBeat);
    return useEngineStore.subscribe((state) => update(state.globalBeat));
  }, [beatWidth, scrollRef]);

  return (
    <div
      ref={playheadRef}
      className={cn(
        "pointer-events-none absolute top-0 bottom-0 left-0 z-20 w-0.5 bg-red-500/90 will-change-transform",
      )}
      style={{ boxShadow: "0 0 10px rgba(239, 68, 68, 0.4)" }}
    >
      <div
        className={cn(
          "absolute top-0 -left-1.25 h-0 w-0",
          "border-t-8 border-r-[6px] border-l-[6px] border-t-red-500/90 border-r-transparent border-l-transparent drop-shadow-md",
        )}
      />
      <div className={cn("absolute top-0 bottom-0 -left-px w-1 bg-red-500/20 blur-[2px]")} />
    </div>
  );
};
