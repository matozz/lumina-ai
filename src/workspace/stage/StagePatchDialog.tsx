import { useEffect, useMemo, useState } from "react";
import { Cable, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fixtureIdsForStage, layoutCapacity } from "@/document/layoutDefinition";
import { activeLayout, activeStage, assetKey } from "@/document/projectModel";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";

export function StagePatchDialog({
  draftCapacity,
  open,
  onOpenChange,
  advanced = false,
}: {
  draftCapacity: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  advanced?: boolean;
}) {
  const bundle = useProjectStore(projectSelectors.bundle);
  const stage = activeStage(bundle);
  const layout = activeLayout(bundle);
  const currentFixtureIds = useMemo(() => fixtureIdsForStage(stage), [stage]);
  const currentCount = currentFixtureIds.length;
  const capacity = layoutCapacity(layout);
  const [fixtureCount, setFixtureCount] = useState(currentCount);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFixtureCount(currentCount);
    setDiagnostic(null);
  }, [currentCount, open]);

  const contiguous = stage.patch.length === 1;
  const valid =
    contiguous && Number.isInteger(fixtureCount) && fixtureCount >= 1 && fixtureCount <= capacity;
  const delta = fixtureCount - currentCount;
  const cueRefs = new Set(
    bundle.cues
      .filter((cue) => assetKey(cue.compatible_stage_ref) === assetKey(stage))
      .map((cue) => assetKey(cue)),
  );
  const arrangementCount = bundle.arrangements.filter((arrangement) =>
    arrangement.tracks.some((track) =>
      (track.clips ?? []).some((clip) => cueRefs.has(assetKey(clip.cue_ref))),
    ),
  ).length;
  const affectedMemberships = patchMembershipImpact(stage, fixtureCount);

  const apply = () => {
    try {
      projectActions.resizeActiveStagePatch(fixtureCount);
      setDiagnostic(null);
      onOpenChange(false);
    } catch (error) {
      setDiagnostic(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[min(88vh,52rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-border border-b px-4 py-3 pr-12">
          <DialogTitle>Configure Stage patch</DialogTitle>
          <DialogDescription>
            Set how many real fixtures are connected to this Stage.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0">
          <div className="flex flex-col gap-4 p-4">
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border">
              <PatchMetric label="Draft positions" value={String(draftCapacity)} />
              <PatchMetric label="Active Layout" value={String(capacity)} />
              <PatchMetric label="Patched fixtures" value={String(currentCount)} />
              {advanced && <PatchMetric label="Internal version" value={String(stage.revision)} />}
            </div>

            {draftCapacity !== capacity && (
              <Alert>
                <AlertTitle>Draft is not on Stage yet</AlertTitle>
                <AlertDescription>
                  This Draft has {draftCapacity} positions, while the active Stage Layout has{" "}
                  {capacity}. Save the Layout and complete Use on Stage impact/remap first; then
                  reopen this dialog to expand the Stage up to {draftCapacity} fixtures.
                </AlertDescription>
              </Alert>
            )}

            {advanced && (
              <Alert>
                <Cable aria-hidden="true" />
                <AlertTitle>Layout and patch are separate</AlertTitle>
                <AlertDescription>
                  A 21×45 Layout contains 945 positions. If this Stage still patches 900 fixtures,
                  Canvas shows the remaining 45 positions with dashed hairline borders; they do not
                  render output or belong to Groups/TargetSets yet.
                </AlertDescription>
              </Alert>
            )}

            <FieldGroup>
              <Field data-invalid={!valid}>
                <FieldLabel htmlFor="stage-patch-count">Fixture count</FieldLabel>
                <Input
                  id="stage-patch-count"
                  type="number"
                  min={1}
                  max={capacity}
                  step={1}
                  value={fixtureCount}
                  aria-invalid={!valid}
                  disabled={!contiguous}
                  onChange={(event) => setFixtureCount(Math.round(Number(event.target.value)))}
                />
                <FieldDescription>
                  Active Stage Layout capacity: {capacity}. Current profile:{" "}
                  <span className="font-mono">{stage.patch[0]?.profile_id ?? "—"}</span>.
                </FieldDescription>
              </Field>
            </FieldGroup>

            {!contiguous && (
              <Alert variant="destructive">
                <AlertTitle>PATCH_RANGE_EDIT_REQUIRES_ADVANCED · stage.patch</AlertTitle>
                <AlertDescription>
                  This Stage uses {stage.patch.length} profile ranges. The safe fixture-count editor
                  only changes one contiguous range; keep the current patch or use an advanced patch
                  migration.
                </AlertDescription>
              </Alert>
            )}

            <section className="border-border flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">
                  {advanced ? "Internal impact" : "What changes"}
                </p>
                <Badge variant={delta === 0 ? "outline" : "secondary"}>
                  {delta > 0 ? "+" + delta : delta} fixtures
                </Badge>
              </div>
              <p className="text-muted-foreground text-[10px] leading-relaxed">
                {advanced
                  ? `Saving updates ${cueRefs.size} Draft Cues and ${arrangementCount} arrangements that use this Stage.`
                  : "Lumina will keep Draft Cues aligned with the new fixture count. Your published and live show stay unchanged."}
              </p>
              {advanced && (
                <p className="text-muted-foreground font-mono text-[9px]">
                  {affectedMemberships.groups} Groups · {affectedMemberships.targetSets} TargetSets
                  require membership trimming when the patch shrinks.
                </p>
              )}
            </section>

            {diagnostic && (
              <Alert variant="destructive">
                <AlertTitle>PATCH_RESIZE_FAILED · stage.patch</AlertTitle>
                <AlertDescription>
                  {diagnostic} Review the Layout capacity and retry.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="m-0 rounded-none px-4 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || fixtureCount === currentCount} onClick={apply}>
            <Save data-icon="inline-start" aria-hidden="true" />
            Save fixture count
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PatchMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background/40 px-2 py-2">
      <p className="text-muted-foreground text-[8px] tracking-wide uppercase">{label}</p>
      <p className="truncate font-mono text-xs">{value}</p>
    </div>
  );
}

function patchMembershipImpact(stage: ReturnType<typeof activeStage>, fixtureCount: number) {
  const [start] = stage.patch[0]?.id_range ?? [1, 1];
  const end = start + Math.max(1, fixtureCount) - 1;
  const valid = (fixtureId: number) => fixtureId >= start && fixtureId <= end;
  return {
    groups: stage.groups.filter(
      (group) => group.id !== "all-fixtures" && groupFixtureIds(group).some((id) => !valid(id)),
    ).length,
    targetSets: stage.target_sets.filter(
      (target) =>
        (target.selector.type === "fixture_ids" &&
          target.selector.fixture_ids.some((id) => !valid(id))) ||
        (target.weights ?? []).some((weight) => !valid(weight.fixture_id)),
    ).length,
  };
}

function groupFixtureIds(group: ReturnType<typeof activeStage>["groups"][number]) {
  if (Array.isArray(group.fixtures)) return group.fixtures;
  const [start, end] = group.fixtures.range;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
