import { cn } from '../utils/cn';

interface GridProps {
  totalBeats: number;
  beatWidth: number;
}

export function TimelineGrid({ totalBeats, beatWidth }: GridProps) {
  return (
    <>
      <div className="absolute inset-0 pointer-events-none flex">
        {Array.from({ length: totalBeats }).map((_, i) => (
          <div 
            key={i} 
            className={cn(
              "h-full border-l",
              i % 4 === 0 ? "border-zinc-700/40" : "border-zinc-800/30 border-dashed"
            )} 
            style={{ width: beatWidth }} 
          />
        ))}
      </div>
      
      <div className={cn("h-7 border-b border-zinc-800/60 bg-zinc-900/80 sticky top-0 z-10 flex backdrop-blur-sm shadow-sm")}>
        {Array.from({ length: totalBeats }).map((_, i) => (
          i % 4 === 0 ? (
            <div 
              key={i} 
              className={cn("absolute text-[10px] text-zinc-500 font-mono pl-1.5 pt-1.5 select-none")} 
              style={{ left: i * beatWidth }}
            >
              {i}
            </div>
          ) : null
        ))}
      </div>
    </>
  );
}
