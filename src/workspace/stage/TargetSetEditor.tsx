import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, Plus, Save, Trash2 } from "lucide-react";
import type {
  FixtureFramePayload,
  LayoutDefinition,
  StageDocument,
  TargetSetDefinition,
  TargetSetSelector,
} from "@/bridge/types";
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
import { fixtureIdsForStage, layoutGridDimensions } from "@/document/layoutDefinition";
import { activeLayout, activeStage, assetKey } from "@/document/projectModel";
import { resolveTargetSet } from "@/document/stageTopology";
import { cn } from "@/lib/utils";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { useWorkspaceStore, workspaceSelectors } from "@/stores/workspace";

type SelectorMode = TargetSetSelector["type"] | "center" | "edges";

export function TargetSetEditor() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const selectedTargetSetId = useProjectStore(projectSelectors.selectedTargetSetId);
  const advancedMode = useWorkspaceStore(workspaceSelectors.advancedMode);
  const stage = activeStage(bundle);
  const layout = activeLayout(bundle);
  const selected =
    stage.target_sets.find((target) => target.id === selectedTargetSetId) ?? stage.target_sets[0];
  const [draft, setDraft] = useState<TargetSetDefinition>(() => structuredClone(selected));
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const fixtureIds = useMemo(() => fixtureIdsForStage(stage), [stage]);
  const resolved = useMemo(() => resolveTargetSet(stage, layout, draft), [draft, layout, stage]);
  const references = targetReferenceImpact(bundle, stage, selected.id);
  const dirty = JSON.stringify(draft) !== JSON.stringify(selected);

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
          <p className="text-xs font-semibold">Fixture areas</p>
          <p className="text-muted-foreground text-[9px]">
            Reusable fixture selections for Effect Lab and Cues
            {advancedMode ? ` · Stage ${stage.id}@${stage.revision}` : ""}
          </p>
        </div>
        <Button
          size="icon-xs"
          variant="outline"
          aria-label="Create TargetSet"
          onClick={() => runAction(() => projectActions.createTargetSet())}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {stage.target_sets.map((target) => (
          <Button
            key={target.id}
            size="xs"
            variant={target.id === selected.id ? "secondary" : "ghost"}
            onClick={() => projectActions.setSelectedTargetSetId(target.id)}
          >
            {target.name}
          </Button>
        ))}
      </div>

      <section className="border-border flex flex-col gap-2.5 rounded-md border p-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{selected.name}</p>
            <p className="text-muted-foreground font-mono text-[8px]">
              {selected.id} · {resolved?.fixtureIds.length ?? 0}/{fixtureIds.length} fixtures ·{" "}
              {resolved?.partitions.length ?? 0} partitions
            </p>
          </div>
          {dirty && <Badge variant="secondary">Unsaved</Badge>}
        </div>

        <Field>
          <FieldLabel htmlFor="target-set-name">Name</FieldLabel>
          <Input
            id="target-set-name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>

        <TargetSetSelectorEditor
          target={draft}
          stage={stage}
          layout={layout}
          advanced={advancedMode}
          onChange={setDraft}
        />

        <TargetGridPreview stage={stage} layout={layout} target={draft} onChange={setDraft} />

        {!resolved && (
          <Alert variant="destructive">
            <AlertTitle>TARGET_SET_INVALID · stage.target_sets.{draft.id}</AlertTitle>
            <AlertDescription>
              This selector does not fit the current Layout grid. Adjust its dimensions or choose
              Fixture IDs before saving.
            </AlertDescription>
          </Alert>
        )}
        {diagnostic && (
          <Alert variant="destructive">
            <AlertTitle>TARGET_SET_ACTION_FAILED · stage.target_sets.{draft.id}</AlertTitle>
            <AlertDescription>
              {diagnostic} Review Cue and TargetingScene references, then retry here.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="sm"
            disabled={!dirty || !draft.name.trim() || !resolved}
            onClick={() =>
              runAction(() => {
                projectActions.saveTargetSet(selected.id, draft);
              })
            }
          >
            <Save data-icon="inline-start" aria-hidden="true" />
            Save area
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runAction(() => projectActions.duplicateTargetSet(selected.id))}
          >
            <Copy data-icon="inline-start" aria-hidden="true" />
            Duplicate
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!resolved}
            onClick={() => previewTargetSet(stage, resolved?.fixtureIds ?? [])}
          >
            <Eye data-icon="inline-start" aria-hidden="true" />
            Preview
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={selected.id === "all" || references.cues > 0 || references.scenes > 0}
            title={
              references.cues + references.scenes > 0
                ? `Referenced by ${references.cues} Cues and ${references.scenes} scenes`
                : undefined
            }
            onClick={() => runAction(() => projectActions.deleteTargetSet(selected.id))}
          >
            <Trash2 data-icon="inline-start" aria-hidden="true" />
            Delete
          </Button>
        </div>
        <FieldDescription>
          {advancedMode
            ? `Saving creates a new Stage revision and upgrades draft dependents. Delete is protected by ${references.cues} Cue and ${references.scenes} scene references.`
            : "Saved areas immediately appear in Effect Lab and can be assigned to Cue effects."}
        </FieldDescription>
      </section>
    </div>
  );
}

function TargetSetSelectorEditor({
  target,
  stage,
  layout,
  advanced,
  onChange,
}: {
  target: TargetSetDefinition;
  stage: StageDocument;
  layout: LayoutDefinition;
  advanced: boolean;
  onChange: (target: TargetSetDefinition) => void;
}) {
  const dimensions = layoutGridDimensions(layout);
  const mode = selectorMode(target.selector);
  const selector = target.selector;
  const fixtureIds = fixtureIdsForStage(stage);
  const updateSelector = (selector: TargetSetSelector) => onChange({ ...target, selector });
  return (
    <>
      <Field>
        <FieldLabel>Selection type</FieldLabel>
        <Select
          value={mode}
          onValueChange={(value) =>
            value && updateSelector(defaultSelector(value as SelectorMode, dimensions, fixtureIds))
          }
        >
          <SelectTrigger size="sm" className="w-full" aria-label="TargetSet selection type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All fixtures</SelectItem>
              <SelectItem value="rows" disabled={!dimensions}>
                Rows
              </SelectItem>
              <SelectItem value="columns" disabled={!dimensions}>
                Columns
              </SelectItem>
              <SelectItem value="grid_zones" disabled={!dimensions}>
                R×C Zones
              </SelectItem>
              <SelectItem value="checkerboard" disabled={!dimensions}>
                Checkerboard
              </SelectItem>
              <SelectItem value="center" disabled={!dimensions}>
                Center
              </SelectItem>
              <SelectItem value="edges" disabled={!dimensions}>
                Edges
              </SelectItem>
              <SelectItem value="fixture_ids">Fixture IDs / custom</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      {advanced && (selector.type === "rows" || selector.type === "columns") && (
        <Field>
          <FieldLabel htmlFor="target-indices">Zero-based indices</FieldLabel>
          <Input
            id="target-indices"
            value={selector.indices.join(", ")}
            onChange={(event) =>
              updateSelector({ ...selector, indices: parseIntegerList(event.target.value) })
            }
          />
        </Field>
      )}
      {selector.type === "grid_zones" && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label="Zone rows"
              value={selector.rows}
              onChange={(rows) =>
                updateSelector({
                  ...selector,
                  rows,
                  zones: selector.zones.filter((zone) => zone.row < rows),
                })
              }
            />
            <NumberInput
              label="Zone columns"
              value={selector.columns}
              onChange={(columns) =>
                updateSelector({
                  ...selector,
                  columns,
                  zones: selector.zones.filter((zone) => zone.column < columns),
                })
              }
            />
          </div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${selector.columns}, minmax(0, 1fr))` }}
            aria-label="R by C zone selection"
          >
            {Array.from({ length: selector.rows * selector.columns }, (_, index) => {
              const zone = {
                row: Math.floor(index / selector.columns),
                column: index % selector.columns,
              };
              const selected = selector.zones.some(
                (candidate) => candidate.row === zone.row && candidate.column === zone.column,
              );
              return (
                <Button
                  key={`${zone.row}:${zone.column}`}
                  type="button"
                  size="xs"
                  variant={selected ? "secondary" : "outline"}
                  aria-pressed={selected}
                  aria-label={`Zone ${zone.row + 1}, ${zone.column + 1}`}
                  onClick={() =>
                    updateSelector({
                      ...selector,
                      zones: selected
                        ? selector.zones.filter(
                            (candidate) =>
                              candidate.row !== zone.row || candidate.column !== zone.column,
                          )
                        : [...selector.zones, zone].sort(
                            (left, right) => left.row - right.row || left.column - right.column,
                          ),
                    })
                  }
                >
                  {zone.row + 1}×{zone.column + 1}
                </Button>
              );
            })}
          </div>
        </div>
      )}
      {selector.type === "checkerboard" && (
        <Field>
          <FieldLabel>Parity</FieldLabel>
          <Select
            value={selector.parity}
            onValueChange={(parity) =>
              parity && updateSelector({ ...selector, parity: parity as "even" | "odd" })
            }
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Checkerboard parity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="even">Even cells</SelectItem>
                <SelectItem value="odd">Odd cells</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
      {selector.type === "center_edges" && (
        <NumberInput
          label="Edge thickness"
          value={selector.thickness}
          onChange={(thickness) => updateSelector({ ...selector, thickness })}
        />
      )}
      {selector.type === "fixture_ids" && (
        <Field>
          <FieldLabel htmlFor="target-fixtures">Fixture IDs</FieldLabel>
          <Input
            id="target-fixtures"
            value={selector.fixture_ids.join(", ")}
            onChange={(event) =>
              updateSelector({
                ...selector,
                fixture_ids: parseIntegerList(event.target.value),
              })
            }
          />
        </Field>
      )}
      {advanced && (
        <Field>
          <FieldLabel htmlFor="target-weights">Fixture weights</FieldLabel>
          <Input
            id="target-weights"
            placeholder="1:1, 2:0.5"
            value={(target.weights ?? [])
              .map((weight) => `${weight.fixture_id}:${weight.weight}`)
              .join(", ")}
            onChange={(event) => onChange({ ...target, weights: parseWeights(event.target.value) })}
          />
          <FieldDescription>
            Optional immutable 0–1 fixture weights, compiled into the spatial cache.
          </FieldDescription>
        </Field>
      )}
    </>
  );
}

function TargetGridPreview({
  stage,
  layout,
  target,
  onChange,
}: {
  stage: StageDocument;
  layout: LayoutDefinition;
  target: TargetSetDefinition;
  onChange: (target: TargetSetDefinition) => void;
}) {
  const dimensions = layoutGridDimensions(layout);
  const fixtureIds = fixtureIdsForStage(stage);
  const selected = new Set(resolveTargetSet(stage, layout, target)?.fixtureIds ?? []);
  if (!dimensions) {
    return (
      <div className="border-border bg-background/40 rounded-md border p-2 text-center">
        <p className="text-muted-foreground text-[9px]">
          Non-grid Layout · All and Fixture IDs remain editable.
        </p>
      </div>
    );
  }
  const [rows, columns] = dimensions;
  return (
    <div className="border-border bg-background/40 rounded-md border p-2">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        role="grid"
        aria-label="TargetSet fixture preview"
      >
        {fixtureIds.slice(0, rows * columns).map((fixtureId, index) => (
          <button
            key={fixtureId}
            type="button"
            role="gridcell"
            aria-label={`Fixture ${fixtureId}`}
            aria-selected={selected.has(fixtureId)}
            className={cn(
              "border-border aspect-square min-h-3 rounded-sm border font-mono text-[7px] transition-colors",
              selected.has(fixtureId)
                ? "border-primary/70 bg-primary/60 text-primary-foreground"
                : "bg-muted/20 text-muted-foreground",
            )}
            onClick={() => onChange(toggleFixtureCell(target, fixtureId, index, columns))}
          >
            {fixtureId}
          </button>
        ))}
      </div>
    </div>
  );
}

function toggleFixtureCell(
  target: TargetSetDefinition,
  fixtureId: number,
  index: number,
  columns: number,
) {
  const selector = target.selector;
  if (selector.type === "rows" || selector.type === "columns") {
    const selectedIndex = selector.type === "rows" ? Math.floor(index / columns) : index % columns;
    const indices = selector.indices.includes(selectedIndex)
      ? selector.indices.filter((candidate) => candidate !== selectedIndex)
      : [...selector.indices, selectedIndex].sort((left, right) => left - right);
    return { ...target, selector: { ...selector, indices } };
  }
  if (selector.type === "fixture_ids") {
    const fixture_ids = selector.fixture_ids.includes(fixtureId)
      ? selector.fixture_ids.filter((candidate) => candidate !== fixtureId)
      : [...selector.fixture_ids, fixtureId].sort((left, right) => left - right);
    return { ...target, selector: { ...selector, fixture_ids } };
  }
  return target;
}

function defaultSelector(
  mode: SelectorMode,
  dimensions: [number, number] | null,
  fixtureIds: number[],
): TargetSetSelector {
  const [rows, columns] = dimensions ?? [1, 1];
  if (mode === "all") return { type: "all" };
  if (mode === "rows") return { type: "rows", indices: Array.from({ length: rows }, (_, i) => i) };
  if (mode === "columns") {
    return { type: "columns", indices: Array.from({ length: columns }, (_, i) => i) };
  }
  if (mode === "grid_zones") {
    return {
      type: "grid_zones",
      rows: 3,
      columns: 3,
      zones: Array.from({ length: 9 }, (_, index) => ({
        row: Math.floor(index / 3),
        column: index % 3,
      })),
    };
  }
  if (mode === "checkerboard") return { type: "checkerboard", parity: "even" };
  if (mode === "center" || mode === "edges") {
    return { type: "center_edges", region: mode, thickness: 1 };
  }
  return { type: "fixture_ids", fixture_ids: fixtureIds };
}

function selectorMode(selector: TargetSetSelector): SelectorMode {
  return selector.type === "center_edges" ? selector.region : selector.type;
}

function targetReferenceImpact(
  bundle: ReturnType<typeof useProjectStore.getState>["bundle"],
  stage: StageDocument,
  targetSetId: string,
) {
  return {
    cues: bundle.cues.filter(
      (cue) =>
        assetKey(cue.compatible_stage_ref) === assetKey(stage) &&
        cue.layers.some((layer) => layer.target_set_ref.target_set_id === targetSetId),
    ).length,
    scenes: (stage.targeting_scenes ?? []).filter((scene) =>
      scene.steps.some((step) => step.selection.target_set_id === targetSetId),
    ).length,
  };
}

function previewTargetSet(stage: StageDocument, selectedFixtureIds: number[]) {
  const selected = new Set(selectedFixtureIds);
  const outputs: FixtureFramePayload[] = fixtureIdsForStage(stage).map((id) => ({
    id,
    profile_id:
      stage.patch.find((item) => id >= item.id_range[0] && id <= item.id_range[1])?.profile_id ??
      "generic-rgb",
    attributes: [
      { id: "intensity", value: { type: "scalar", value: selected.has(id) ? 1 : 0.04 } },
      {
        id: "color.rgb",
        value: { type: "color", value: selected.has(id) ? [40, 220, 255] : [8, 10, 14] },
      },
    ],
  }));
  window.dispatchEvent(new CustomEvent("workspace:test-fixtures", { detail: outputs }));
}

function parseIntegerList(value: string) {
  return [
    ...new Set(
      value
        .split(/[,\s]+/)
        .map(Number)
        .filter((item) => Number.isInteger(item) && item >= 0),
    ),
  ];
}

function parseWeights(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().split(":"))
    .filter((pair) => pair.length === 2)
    .map(([fixtureId, weight]) => ({ fixture_id: Number(fixtureId), weight: Number(weight) }))
    .filter(
      (item) =>
        Number.isInteger(item.fixture_id) && item.fixture_id > 0 && Number.isFinite(item.weight),
    );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        aria-label={label}
        type="number"
        min={1}
        step={1}
        value={value}
        onChange={(event) => onChange(Math.max(1, Math.round(Number(event.target.value))))}
      />
    </Field>
  );
}
