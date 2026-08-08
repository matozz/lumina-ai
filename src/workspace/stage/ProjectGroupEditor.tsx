import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, Plus, Save, Trash2 } from "lucide-react";
import type { FixtureFramePayload, GroupDSL, SortByDSL } from "@/bridge/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fixtureIdsForStage,
  layoutGridDimensions,
  layoutPositions,
} from "@/document/layoutDefinition";
import { activeLayout, activeStage } from "@/document/projectModel";
import { cn } from "@/lib/utils";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";

const SORT_OPTIONS: Array<{ value: SortByDSL; label: string }> = [
  { value: "none", label: "Fixture ID" },
  { value: "x", label: "Left → right" },
  { value: "-x", label: "Right → left" },
  { value: "y", label: "Top → bottom" },
  { value: "-y", label: "Bottom → top" },
  { value: "distance_center", label: "Center → edge" },
];

export function ProjectGroupEditor() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const stage = activeStage(bundle);
  const layout = activeLayout(bundle);
  const [selectedGroupId, setSelectedGroupId] = useState(stage.groups[0]?.id ?? "");
  const selected = stage.groups.find((group) => group.id === selectedGroupId) ?? stage.groups[0];
  const [draft, setDraft] = useState<GroupDSL>(() => structuredClone(selected));
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const fixtureIds = useMemo(() => fixtureIdsForStage(stage), [stage]);
  const selectedFixtures = useMemo(() => new Set(groupFixtureIds(draft)), [draft]);
  const dirty = JSON.stringify(selected) !== JSON.stringify(draft);

  useEffect(() => {
    setDraft(structuredClone(selected));
    setDiagnostic(null);
  }, [selected]);

  const runAction = (action: () => void) => {
    try {
      action();
      setDiagnostic(null);
    } catch (error) {
      setDiagnostic(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">Fixture Groups</p>
          <p className="text-muted-foreground text-[9px]">
            Static Stage organization · never mutated during playback
          </p>
        </div>
        <Button
          size="icon-xs"
          variant="outline"
          aria-label="Create fixture Group"
          onClick={() =>
            runAction(() => {
              setSelectedGroupId(projectActions.createStageGroup());
            })
          }
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {stage.groups.map((group) => (
          <Button
            key={group.id}
            size="xs"
            variant={group.id === selected.id ? "secondary" : "ghost"}
            onClick={() => setSelectedGroupId(group.id)}
          >
            {group.name}
          </Button>
        ))}
      </div>

      <section className="border-border flex flex-col gap-2.5 rounded-md border p-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{selected.name}</p>
            <p className="text-muted-foreground font-mono text-[8px]">
              {selected.id} · {selectedFixtures.size}/{fixtureIds.length} fixtures
            </p>
          </div>
          {dirty && <Badge variant="secondary">Unsaved</Badge>}
        </div>

        <Field>
          <FieldLabel htmlFor="fixture-group-name">Name</FieldLabel>
          <Input
            id="fixture-group-name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel>Fixture ordering</FieldLabel>
          <Select
            value={draft.sort_by ?? "none"}
            onValueChange={(sort_by) =>
              sort_by && setDraft({ ...draft, sort_by: sort_by as SortByDSL })
            }
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Fixture Group ordering">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-5 gap-1">
          {(["all", "left", "right", "top", "bottom"] as const).map((filter) => (
            <Button
              key={filter}
              size="xs"
              variant="outline"
              onClick={() =>
                setDraft({
                  ...draft,
                  fixtures: fixturesByFilter(layout, fixtureIds, filter),
                })
              }
            >
              {filter}
            </Button>
          ))}
        </div>

        <FixtureGroupGrid
          fixtureIds={fixtureIds}
          columns={layoutGridDimensions(layout)?.[1] ?? Math.ceil(Math.sqrt(fixtureIds.length))}
          selected={selectedFixtures}
          onToggle={(fixtureId) => {
            const fixtures = selectedFixtures.has(fixtureId)
              ? groupFixtureIds(draft).filter((id) => id !== fixtureId)
              : [...groupFixtureIds(draft), fixtureId].sort((left, right) => left - right);
            setDraft({ ...draft, fixtures });
          }}
        />

        {diagnostic && (
          <Alert variant="destructive">
            <AlertTitle>GROUP_ACTION_FAILED · stage.groups.{draft.id}</AlertTitle>
            <AlertDescription>
              {diagnostic} Restore a valid fixture selection and retry here.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="sm"
            disabled={!dirty || !draft.name.trim() || selectedFixtures.size === 0}
            onClick={() => runAction(() => projectActions.saveStageGroup(selected.id, draft))}
          >
            <Save data-icon="inline-start" aria-hidden="true" />
            Save group
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              runAction(() => {
                setSelectedGroupId(projectActions.duplicateStageGroup(selected.id));
              })
            }
          >
            <Copy data-icon="inline-start" aria-hidden="true" />
            Duplicate
          </Button>
          <Button size="sm" variant="outline" onClick={() => previewGroup(stage, selectedFixtures)}>
            <Eye data-icon="inline-start" aria-hidden="true" />
            Preview
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={selected.id === "all-fixtures"}
            onClick={() =>
              runAction(() => {
                projectActions.deleteStageGroup(selected.id);
                setSelectedGroupId("");
              })
            }
          >
            <Trash2 data-icon="inline-start" aria-hidden="true" />
            Delete
          </Button>
        </div>
        <FieldDescription>
          Save updates this Stage configuration. Playback expresses motion through scene weights,
          never by changing fixture membership.
        </FieldDescription>
      </section>
    </div>
  );
}

function FixtureGroupGrid({
  fixtureIds,
  columns,
  selected,
  onToggle,
}: {
  fixtureIds: number[];
  columns: number;
  selected: Set<number>;
  onToggle: (fixtureId: number) => void;
}) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))` }}
      role="grid"
      aria-label="Fixture Group membership"
    >
      {fixtureIds.map((fixtureId) => (
        <button
          key={fixtureId}
          type="button"
          role="gridcell"
          aria-label={`Group fixture ${fixtureId}`}
          aria-selected={selected.has(fixtureId)}
          className={cn(
            "border-border aspect-square min-h-3 rounded-sm border font-mono text-[7px]",
            selected.has(fixtureId)
              ? "border-primary/70 bg-primary/60 text-primary-foreground"
              : "bg-muted/20 text-muted-foreground",
          )}
          onClick={() => onToggle(fixtureId)}
        >
          {fixtureId}
        </button>
      ))}
    </div>
  );
}

function groupFixtureIds(group: GroupDSL) {
  if (Array.isArray(group.fixtures)) return group.fixtures;
  const [start, end] = group.fixtures.range;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function fixturesByFilter(
  layout: ReturnType<typeof activeLayout>,
  fixtureIds: number[],
  filter: "all" | "left" | "right" | "top" | "bottom",
) {
  if (filter === "all") return fixtureIds;
  const positions = layoutPositions(layout, fixtureIds);
  if (positions.length !== fixtureIds.length) return fixtureIds;
  const xs = positions.map((position) => position.x);
  const ys = positions.map((position) => position.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  return positions
    .filter((position) => {
      if (filter === "left") return position.x <= centerX;
      if (filter === "right") return position.x > centerX;
      if (filter === "top") return position.y <= centerY;
      return position.y > centerY;
    })
    .map((position) => position.id);
}

function previewGroup(stage: ReturnType<typeof activeStage>, selected: Set<number>) {
  const outputs: FixtureFramePayload[] = fixtureIdsForStage(stage).map((id) => ({
    id,
    profile_id:
      stage.patch.find((item) => id >= item.id_range[0] && id <= item.id_range[1])?.profile_id ??
      "generic-rgb",
    attributes: [
      { id: "intensity", value: { type: "scalar", value: selected.has(id) ? 1 : 0.04 } },
      {
        id: "color.rgb",
        value: { type: "color", value: selected.has(id) ? [160, 255, 90] : [8, 10, 14] },
      },
    ],
  }));
  window.dispatchEvent(new CustomEvent("workspace:test-fixtures", { detail: outputs }));
}
