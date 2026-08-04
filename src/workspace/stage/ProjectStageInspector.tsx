import { Copy, LayoutTemplate } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { activeLayout, activeStage, assetKey, exactAsset } from "@/document/projectModel";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";

export function ProjectStageInspector() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const selectedLayoutRef = useProjectStore(projectSelectors.selectedLayoutRef);
  const stage = activeStage(bundle);
  const stageLayout = activeLayout(bundle);
  const selectedLayout = exactAsset(bundle.layouts, selectedLayoutRef) ?? stageLayout;
  const usedOnStage = assetKey(stage.layout_ref) === assetKey(selectedLayoutRef);

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label="Stage inspector">
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <LayoutTemplate className="text-primary" aria-hidden="true" />
        <span className="text-xs font-medium">Layout Draft</span>
        <Badge variant="outline" className="ml-auto">
          r{selectedLayout.revision}
        </Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{selectedLayout.name}</p>
              <p className="text-muted-foreground text-[10px]">
                {selectedLayout.geometry.shape} · {selectedLayout.editor.mode}
              </p>
            </div>
            {usedOnStage && <Badge variant="secondary">On Stage</Badge>}
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Layout edits are isolated from {stage.name}. Canvas preview and explicit Use on Stage
            impact/remap controls are provided by the Layout Draft editor.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => projectActions.duplicateLayout(selectedLayoutRef)}
          >
            <Copy data-icon="inline-start" aria-hidden="true" />
            Duplicate Layout
          </Button>
        </div>
      </ScrollArea>
    </aside>
  );
}
