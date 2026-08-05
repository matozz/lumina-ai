import { LayoutGrid, ScanSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fixtureIdsForStage, layoutGridDimensions } from "@/document/layoutDefinition";
import { activeLayout, activeStage } from "@/document/projectModel";
import { projectSelectors, useProjectStore } from "@/stores/project";
import { ProjectGroupEditor } from "./ProjectGroupEditor";
import { TargetSetEditor } from "./TargetSetEditor";

export type StageCollectionEditorKind = "groups" | "targets";

export function StageCollectionEditorDialog({
  kind,
  open,
  onOpenChange,
}: {
  kind: StageCollectionEditorKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const bundle = useProjectStore(projectSelectors.bundle);
  const stage = activeStage(bundle);
  const layout = activeLayout(bundle);
  const fixtures = fixtureIdsForStage(stage);
  const dimensions = layoutGridDimensions(layout);
  const groups = kind === "groups";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[min(92vh,58rem)] w-[min(96vw,80rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-none">
        <DialogHeader className="border-border border-b px-4 py-3 pr-12">
          <div className="flex items-center gap-2">
            {groups ? <LayoutGrid aria-hidden="true" /> : <ScanSearch aria-hidden="true" />}
            <DialogTitle>{groups ? "Fixture Group editor" : "TargetSet editor"}</DialogTitle>
            <Badge variant="outline" className="ml-auto">
              {dimensions ? dimensions[0] + "×" + dimensions[1] : layout.geometry.shape}
            </Badge>
          </div>
          <DialogDescription>
            {fixtures.length} patched fixtures · Stage {stage.id}@{stage.revision}. The expanded
            grid keeps fixture cells usable without stacking inside the Stage inspector.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0">
          <div className="mx-auto w-full max-w-6xl">
            {groups ? <ProjectGroupEditor /> : <TargetSetEditor />}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function StageCollectionEditorLauncher({
  kind,
  onOpen,
}: {
  kind: StageCollectionEditorKind;
  onOpen: () => void;
}) {
  const bundle = useProjectStore(projectSelectors.bundle);
  const stage = activeStage(bundle);
  const count = kind === "groups" ? stage.groups.length : stage.target_sets.length;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center">
      <div className="border-border bg-background/40 flex size-10 items-center justify-center rounded-md border">
        {kind === "groups" ? (
          <LayoutGrid className="text-muted-foreground" aria-hidden="true" />
        ) : (
          <ScanSearch className="text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div>
        <p className="text-xs font-medium">
          {count} {kind === "groups" ? "Fixture Groups" : "TargetSets"}
        </p>
        <p className="text-muted-foreground mt-1 text-[10px] leading-relaxed">
          Open the expanded editor for a responsive fixture grid and revision-safe save controls.
        </p>
      </div>
      <Button size="sm" onClick={onOpen}>
        Open {kind === "groups" ? "Group" : "TargetSet"} editor
      </Button>
    </div>
  );
}
