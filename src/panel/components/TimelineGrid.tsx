import { cn } from "@/lib/utils";
import type { TimelineViewport } from "../virtualization";

interface GridProps {
  beatWidth: number;
  viewport: TimelineViewport;
}

export const TimelineGrid = ({ beatWidth, viewport }: GridProps) => {
  const firstBarBeat = Math.max(0, Math.floor(viewport.startBeat / 4) * 4);
  const lastBarBeat = Math.ceil(viewport.endBeat / 4) * 4;
  const labels = Array.from(
    { length: Math.max(0, (lastBarBeat - firstBarBeat) / 4 + 1) },
    (_, index) => firstBarBeat + index * 4,
  );

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            "linear-gradient(to right, rgba(63,63,70,0.4) 1px, transparent 1px)",
            "linear-gradient(to right, rgba(39,39,42,0.3) 1px, transparent 1px)",
          ].join(","),
          backgroundSize: `${beatWidth * 4}px 100%, ${beatWidth}px 100%`,
        }}
      />

      <div
        className={cn(
          "sticky top-0 z-10 h-7 border-b border-zinc-800/60 bg-zinc-900/80 shadow-sm backdrop-blur-sm",
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
