import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TimelineViewport } from "../virtualization";

interface AutomationLaneAddButtonProps {
  definitionName: string;
  onAdd: () => void;
  viewport: TimelineViewport;
  beatWidth: number;
}

export const AutomationLaneAddButton = ({
  definitionName,
  onAdd,
  viewport,
  beatWidth,
}: AutomationLaneAddButtonProps) => (
  <Button
    variant="ghost"
    size="icon-xs"
    className="absolute top-1 opacity-0 group-hover/lane:opacity-100 focus-visible:opacity-100"
    style={{
      left: Math.max(4, (viewport.visibleStartBeat ?? viewport.startBeat) * beatWidth + 4),
    }}
    aria-label={`Add ${definitionName} keyframe at playhead`}
    onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
    onClick={(mouseEvent) => {
      mouseEvent.stopPropagation();
      onAdd();
    }}
    onDoubleClick={(mouseEvent) => mouseEvent.stopPropagation()}
  >
    <Plus />
  </Button>
);
