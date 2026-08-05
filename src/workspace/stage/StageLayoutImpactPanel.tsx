import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, GitBranch, ShieldCheck, X } from "lucide-react";
import type { AssetRef } from "@/bridge/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StageTopologyImpact } from "@/document/stageTopology";
import { cn } from "@/lib/utils";
import type { StageLayoutUpgradeRequest } from "@/stores/project";

export function StageLayoutImpactPanel({
  impact,
  onApply,
  onClose,
  advanced = false,
}: {
  impact: StageTopologyImpact;
  onApply: (request: StageLayoutUpgradeRequest) => void;
  onClose: () => void;
  advanced?: boolean;
}) {
  const invalidTargets = impact.targetSets.filter((target) => !target.valid);
  const defaultTargetId = impact.validTargetSetIds.includes("all")
    ? "all"
    : impact.validTargetSetIds[0];
  const [targetMappings, setTargetMappings] = useState<Record<string, string>>(() =>
    Object.fromEntries(invalidTargets.map((target) => [target.id, defaultTargetId])),
  );
  const mappingsComplete = invalidTargets.every((target) =>
    impact.validTargetSetIds.includes(targetMappings[target.id]),
  );
  const changedTargets = impact.targetSets.filter(
    (target) => !target.valid || target.membershipChanged,
  );
  const referenceSummary = useMemo(
    () => [
      `${impact.groups.length} Groups inspected`,
      `${impact.targetSets.length} TargetSets inspected`,
      `${impact.cues.length} Cue revisions affected`,
      `${impact.arrangements.length} Arrangement revisions affected indirectly`,
    ],
    [impact],
  );
  const apply = (mode: StageLayoutUpgradeRequest["mode"], upgradeDependents: boolean) =>
    onApply({
      layoutRef: impact.candidateLayoutRef,
      mode,
      targetMappings,
      upgradeDependents,
    });

  if (!advanced) {
    return (
      <section
        className="border-primary/40 bg-background/80 flex flex-col gap-3 rounded-md border p-3"
        aria-label="Stage Layout impact"
      >
        <div className="flex items-start gap-2">
          {impact.capacityFits ? (
            <CheckCircle2 className="mt-0.5 size-4 text-emerald-400" aria-hidden="true" />
          ) : (
            <AlertTriangle className="text-destructive mt-0.5 size-4" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {impact.capacityFits ? "Update the Stage?" : "This layout is too small"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {impact.capacityFits
                ? "This changes where existing Cues play. Lumina will keep compatible Cues working and ask only about fixture groups that no longer fit."
                : `This layout has ${impact.candidateCapacity} positions, but your Stage uses ${impact.fixtureCount} fixtures. Increase the layout size before continuing.`}
            </p>
          </div>
          <Button size="icon-xs" variant="ghost" aria-label="Cancel Stage update" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>

        {invalidTargets.map((target) => (
          <div key={target.id} className="border-border grid gap-1.5 rounded-md border p-2.5">
            <p className="text-xs font-medium">Where should “{target.name}” play?</p>
            <Select
              value={targetMappings[target.id]}
              onValueChange={(value) =>
                value && setTargetMappings((current) => ({ ...current, [target.id]: value }))
              }
            >
              <SelectTrigger size="sm" className="w-full" aria-label={`Remap ${target.name}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {impact.targetSets
                    .filter((candidate) => candidate.valid)
                    .map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ))}

        <div className="border-border flex items-center gap-2 rounded-md border p-2.5">
          <ShieldCheck className="size-4 text-emerald-400" aria-hidden="true" />
          <p className="text-muted-foreground text-xs">
            Your published and live show will not change until you publish again.
          </p>
        </div>

        {impact.capacityFits && (
          <Button
            size="sm"
            disabled={!mappingsComplete}
            onClick={() => apply(impact.compatible ? "upgrade" : "remap", true)}
          >
            Update Stage & choose an Effect
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </section>
    );
  }

  return (
    <section
      className="border-primary/40 bg-background/80 flex flex-col gap-3 rounded-md border p-2.5"
      aria-label="Stage Layout impact"
    >
      <div className="flex items-start gap-2">
        {impact.compatible ? (
          <CheckCircle2 className="mt-0.5 size-4 text-emerald-400" aria-hidden="true" />
        ) : (
          <AlertTriangle className="text-destructive mt-0.5 size-4" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">
            {impact.compatible
              ? "Compatible Stage upgrade"
              : impact.capacityFits
                ? "Topology remap required"
                : "Layout capacity cannot fit this Stage"}
          </p>
          <p className="text-muted-foreground font-mono text-[9px]">
            {formatRef(impact.currentLayoutRef)} <ArrowRight className="inline size-2.5" />{" "}
            {formatRef(impact.candidateLayoutRef)}
          </p>
        </div>
        <Button size="icon-xs" variant="ghost" aria-label="Cancel impact review" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border">
        <ImpactMetric label="Fixtures" value={String(impact.fixtureCount)} />
        <ImpactMetric
          label="Capacity"
          value={`${impact.currentCapacity}→${impact.candidateCapacity}`}
        />
        <ImpactMetric
          label="Moved"
          value={impact.movedFixtureCount === null ? "compiler" : String(impact.movedFixtureCount)}
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {referenceSummary.map((summary) => (
          <Badge key={summary} variant="outline" className="font-normal">
            {summary}
          </Badge>
        ))}
      </div>

      <ImpactSection title="Groups" count={impact.groups.length}>
        {impact.groups.map((group) => (
          <ImpactRow
            key={group.id}
            label={group.name}
            detail={`${group.fixtureCount} fixtures · membership unchanged`}
            status="safe"
          />
        ))}
      </ImpactSection>

      <ImpactSection title="TargetSets" count={impact.targetSets.length}>
        {impact.targetSets.map((target) => (
          <div key={target.id} className="border-border border-b py-1.5 last:border-b-0">
            <ImpactRow
              label={target.name}
              detail={`${target.beforeCount}→${target.afterCount} fixtures · ${target.beforePartitions}→${target.afterPartitions} partitions`}
              status={target.valid && !target.membershipChanged ? "safe" : "warning"}
            />
            {target.reason && (
              <p className="text-muted-foreground mt-1 text-[9px] leading-relaxed">
                {target.reason}
              </p>
            )}
            {!target.valid && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-muted-foreground text-[9px]">Remap to</span>
                <Select
                  value={targetMappings[target.id]}
                  onValueChange={(value) =>
                    value && setTargetMappings((current) => ({ ...current, [target.id]: value }))
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="h-7 flex-1"
                    aria-label={`Remap ${target.name}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {impact.targetSets
                        .filter((candidate) => candidate.valid)
                        .map((candidate) => (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            {candidate.name}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ))}
      </ImpactSection>

      <ImpactSection
        title="Pinned dependents"
        count={impact.cues.length + impact.arrangements.length}
      >
        {impact.cues.length === 0 && impact.arrangements.length === 0 ? (
          <p className="text-muted-foreground py-1 text-[9px]">No Cue references are pinned.</p>
        ) : (
          <>
            {impact.cues.map((cue) => (
              <ImpactRow
                key={formatRef(cue.reference)}
                label={cue.name}
                detail={`${formatRef(cue.reference)} · ${cue.layers} layers · new revision required`}
                status="warning"
              />
            ))}
            {impact.arrangements.map((arrangement) => (
              <ImpactRow
                key={formatRef(arrangement.reference)}
                label={arrangement.name}
                detail={`${formatRef(arrangement.reference)} · ${arrangement.clipCount} indirect clips · new revision required`}
                status="warning"
              />
            ))}
          </>
        )}
      </ImpactSection>

      {changedTargets.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>TARGET_TOPOLOGY_CHANGED · stage.target_sets</AlertTitle>
          <AlertDescription>
            {changedTargets.length} TargetSets change membership or become invalid. Confirm each
            remap below, preserve the old Stage, create a separate Stage, or cancel with no
            modification.
          </AlertDescription>
        </Alert>
      )}

      {!impact.capacityFits && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>LAYOUT_CAPACITY_BELOW_STAGE_PATCH · stage.patch</AlertTitle>
          <AlertDescription>
            This Layout has {impact.candidateCapacity} positions for {impact.fixtureCount} patched
            fixtures. Keep the old Stage or cancel, then increase the Layout capacity before
            applying it. The saved Layout asset and Canvas preview remain available.
          </AlertDescription>
        </Alert>
      )}

      <div className="border-border flex items-center gap-2 rounded-md border p-2">
        <ShieldCheck className="size-3.5 text-emerald-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium">Revision isolation</p>
          <p className="text-muted-foreground text-[9px]">
            Published revisions and Live Snapshot: 0 changes. Old Stage, Cue, and Arrangement
            revisions remain addressable.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {impact.compatible ? (
          <Button size="sm" onClick={() => apply("upgrade", true)}>
            <GitBranch data-icon="inline-start" aria-hidden="true" />
            Upgrade Stage + listed dependents
          </Button>
        ) : impact.capacityFits ? (
          <Button size="sm" disabled={!mappingsComplete} onClick={() => apply("remap", true)}>
            <GitBranch data-icon="inline-start" aria-hidden="true" />
            Remap + upgrade listed dependents
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          disabled={!impact.capacityFits || !mappingsComplete}
          onClick={() => apply("create_stage", false)}
        >
          Create new Stage + empty Arrangement
        </Button>
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="xs" variant="ghost" onClick={onClose}>
            Keep old Stage revision
          </Button>
          <Button size="xs" variant="ghost" onClick={onClose}>
            Cancel · no changes
          </Button>
        </div>
      </div>
    </section>
  );
}

function ImpactSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="border-border mb-0.5 flex items-center border-b pb-1">
        <h3 className="text-[10px] font-medium">{title}</h3>
        <span className="text-muted-foreground ml-auto font-mono text-[9px]">{count}</span>
      </div>
      {children}
    </section>
  );
}

function ImpactRow({
  label,
  detail,
  status,
}: {
  label: string;
  detail: string;
  status: "safe" | "warning";
}) {
  return (
    <div className="flex items-start gap-1.5 py-1">
      <span
        className={cn(
          "mt-1 size-1.5 shrink-0 rounded-full",
          status === "safe" ? "bg-emerald-400" : "bg-destructive",
        )}
      />
      <div className="min-w-0">
        <p className="truncate text-[10px]">{label}</p>
        <p className="text-muted-foreground font-mono text-[8px] leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}

function ImpactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-2 py-1.5">
      <p className="text-muted-foreground text-[8px] tracking-wide uppercase">{label}</p>
      <p className="font-mono text-[10px] tabular-nums">{value}</p>
    </div>
  );
}

function formatRef(reference: AssetRef) {
  return `${reference.id}@${reference.revision}`;
}
