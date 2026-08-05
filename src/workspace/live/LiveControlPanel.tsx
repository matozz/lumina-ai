import { useEffect } from "react";
import { RadioTower } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { engineSelectors, useEngineStore } from "@/stores/engine";
import { useWorkspaceStore, workspaceActions, workspaceSelectors } from "@/stores/workspace";
import { LiveDiagnostics } from "./LiveDiagnostics";
import { LivePadGrid } from "./LivePadGrid";
import { LivePadSettings } from "./LivePadSettings";
import { LiveTransportControls } from "./LiveTransportControls";

export function LiveControlPanel({ embedded = false }: { embedded?: boolean }) {
  const effects = useEngineStore(engineSelectors.liveEffects);
  const liveRevision = useEngineStore(engineSelectors.liveShowRevision);
  const selectedEffectId = useWorkspaceStore(workspaceSelectors.selectedLiveEffectId);

  useEffect(() => {
    if (effects.length > 0 && !effects.some((effect) => effect.instance_id === selectedEffectId)) {
      workspaceActions.setSelectedLiveEffectId(effects[0].instance_id);
    }
  }, [effects, selectedEffectId]);

  return (
    <aside
      className="bg-card flex h-full min-h-0 flex-col"
      aria-label="Live and rehearsal controls"
      data-layout-region={embedded ? "inspector" : "live-control"}
    >
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <RadioTower className="size-3.5 text-amber-400" aria-hidden="true" />
        <span className="text-xs font-medium">Live / Rehearse</span>
        <span className="text-muted-foreground ml-auto text-[10px]">
          {liveRevision === null ? "Not live" : "Live"}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2.5 p-2.5">
          <LiveTransportControls />
          <LivePadSettings effects={effects} selectedEffectId={selectedEffectId} />
          <LivePadGrid effects={effects} />
          <LiveDiagnostics />
        </div>
      </ScrollArea>
    </aside>
  );
}
