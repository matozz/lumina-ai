import { ListMusic } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CompileResult } from '../bridge/types';
import { Button } from "@/components/ui/button";

interface ResourcePanelProps {
  compileResult: CompileResult | null;
  selectedPhaser: string | null;
  onSelectPhaser: (id: string | null) => void;
}

export function TimelineResourcePanel({ compileResult, selectedPhaser, onSelectPhaser }: ResourcePanelProps) {
  const phasers = compileResult?.phasers || [];

  return (
    <div className={cn("w-48 border-r border-zinc-800 bg-zinc-900/40 flex flex-col shrink-0 z-10")}>
      <div className={cn("h-7 border-b border-zinc-800/60 bg-zinc-900/60 flex items-center px-3 shadow-sm")}>
        <span className={cn("text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5")}>
          <ListMusic className="w-3 h-3" /> Library
        </span>
      </div>
      <div className={cn("flex-1 overflow-y-auto custom-scrollbar p-2")}>
        <div className="mb-4">
          <div className={cn("text-[10px] font-semibold text-zinc-500 mb-2 px-1 tracking-wider")}>
            PHASERS
          </div>
          <div className="flex flex-col gap-1">
            {phasers.map(p => (
              <Button
                key={`res-phaser-${p.id}`}
                variant="ghost"
                onClick={() => onSelectPhaser(p.id)}
                className={cn(
                  "text-left px-2.5 py-1.5 text-xs rounded-md border transition-all duration-150 flex items-center justify-between group h-auto",
                  selectedPhaser === p.id 
                    ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-sm hover:bg-indigo-500/30 hover:text-indigo-200" 
                    : "bg-zinc-800/30 border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                )}
              >
                <span className="truncate">{p.name}</span>
                <span className={cn(
                  "text-[10px] opacity-0 group-hover:opacity-100 transition-opacity",
                  selectedPhaser === p.id ? "text-indigo-400" : "text-zinc-500"
                )}>
                  Select
                </span>
              </Button>
            ))}
            {phasers.length === 0 && (
              <div className="text-xs text-zinc-600 italic px-2">No phasers found in DSL</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
