import { cn } from '@/lib/utils';

interface PlayheadProps {
  playheadX: number;
}

export function TimelinePlayhead({ playheadX }: PlayheadProps) {
  return (
    <div 
      className={cn(
        "absolute top-0 bottom-0 w-0.5 bg-red-500/90 z-20 pointer-events-none transition-transform duration-75"
      )}
      style={{ left: playheadX, boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)' }}
    >
      <div className={cn(
        "absolute top-0 -left-1.25 w-0 h-0",
        "border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-8 border-t-red-500/90 drop-shadow-md"
      )} />
      <div className={cn("absolute top-0 bottom-0 -left-px w-1 bg-red-500/20 blur-[2px]")} />
    </div>
  );
}
