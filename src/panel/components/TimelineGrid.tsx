import { cn } from "@/lib/utils";

interface GridProps {
  totalBeats: number;
  beatWidth: number;
}

export const TimelineGrid = (props: GridProps) => {
  const { totalBeats, beatWidth } = props;

  return (
    <>
      <div className="pointer-events-none absolute inset-0 flex">
        {Array.from({ length: totalBeats }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-full border-l",
              i % 4 === 0 ? "border-zinc-700/40" : "border-dashed border-zinc-800/30",
            )}
            style={{ width: beatWidth }}
          />
        ))}
      </div>

      <div
        className={cn(
          "sticky top-0 z-10 flex h-7 border-b border-zinc-800/60 bg-zinc-900/80 shadow-sm backdrop-blur-sm",
        )}
      >
        {Array.from({ length: totalBeats }).map((_, i) =>
          i % 4 === 0 ? (
            <div
              key={i}
              className={cn(
                "absolute pt-1.5 pl-1.5 font-mono text-[10px] text-zinc-500 select-none",
              )}
              style={{ left: i * beatWidth }}
            >
              {i}
            </div>
          ) : null,
        )}
      </div>
    </>
  );
};
