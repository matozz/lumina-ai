import { cn } from "@/lib/utils";

interface PlayheadProps {
  playheadX: number;
}

export const TimelinePlayhead = (props: PlayheadProps) => {
  const { playheadX } = props;

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-red-500/90 transition-transform duration-75",
      )}
      style={{ left: playheadX, boxShadow: "0 0 10px rgba(239, 68, 68, 0.4)" }}
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
