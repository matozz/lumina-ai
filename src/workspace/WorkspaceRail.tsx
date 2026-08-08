import type { LucideIcon } from "lucide-react";
import { Activity, FlaskConical, Layers2, Layers3, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { WorkspaceId } from "@/stores/workspace";

interface WorkspaceDefinition {
  id: WorkspaceId;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

const workspaces: WorkspaceDefinition[] = [
  { id: "stage", label: "Stage", shortLabel: "Stage", icon: Lightbulb },
  { id: "effect-lab", label: "Effect Lab", shortLabel: "Lab", icon: FlaskConical },
  { id: "cues", label: "Cues", shortLabel: "Cues", icon: Layers2 },
  { id: "arrange", label: "Arrange", shortLabel: "Arrange", icon: Layers3 },
  { id: "live", label: "Live", shortLabel: "Live", icon: Activity },
];

interface WorkspaceRailProps {
  activeWorkspace: WorkspaceId;
  onSelect: (workspace: WorkspaceId) => void;
}

export function WorkspaceRail({ activeWorkspace, onSelect }: WorkspaceRailProps) {
  return (
    <nav
      className={cn(
        "border-sidebar-border bg-sidebar flex w-16 shrink-0 flex-col gap-1 border-r p-1.5",
      )}
      aria-label="Primary workspaces"
    >
      {workspaces.map(({ id, label, shortLabel, icon: Icon }) => (
        <Tooltip key={id}>
          <TooltipTrigger
            render={
              <Button
                variant={activeWorkspace === id ? "secondary" : "ghost"}
                size="sm"
                className="h-12 w-full flex-col gap-0.5 px-1"
                aria-current={activeWorkspace === id ? "page" : undefined}
                aria-label={label}
                onClick={() => onSelect(id)}
              />
            }
          >
            <Icon aria-hidden="true" />
            <span className="max-w-full truncate text-[10px]">{shortLabel}</span>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
    </nav>
  );
}
