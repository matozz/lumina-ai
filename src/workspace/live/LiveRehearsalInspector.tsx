import { RadioTower } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceStore, workspaceSelectors } from "@/stores/workspace";
import { LiveControlPanel } from "./LiveControlPanel";
import { WorkspacePanelHeader } from "../WorkspacePanelHeader";

export function LiveRehearsalInspector() {
  const liveRevision = useWorkspaceStore(workspaceSelectors.liveRevision);

  return (
    <div className="bg-card flex h-full min-h-0 flex-col" aria-label="Live controls">
      <WorkspacePanelHeader icon={RadioTower} title="Live controls" iconClassName="text-primary">
        <Badge variant={liveRevision === null ? "outline" : "secondary"} className="ml-auto">
          {liveRevision === null ? "Offline" : "Live"}
        </Badge>
      </WorkspacePanelHeader>
      <div className="border-border flex shrink-0 flex-col gap-2 border-b p-2.5">
        <p className="text-muted-foreground text-[10px] leading-relaxed">
          Live runs the Arrangement selected in Arrange. Use the Live button in the top bar to send
          the latest changes to output.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <LiveControlPanel embedded />
      </div>
    </div>
  );
}
