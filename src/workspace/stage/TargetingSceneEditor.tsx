import { useEffect, useState } from "react";
import { Copy, Eye, Plus, Save, Trash2 } from "lucide-react";
import type {
  FixtureFramePayload,
  StageDocument,
  TargetingDuration,
  TargetingSceneDefinition,
  TargetingSceneStep,
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
import { fixtureIdsForStage } from "@/document/layoutDefinition";
import { activeLayout, activeStage, assetKey, uniqueId } from "@/document/projectModel";
import { resolveTargetSet } from "@/document/stageTopology";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";

export function TargetingSceneEditor() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const stage = activeStage(bundle);
  const scenes = stage.targeting_scenes ?? [];
  const [selectedSceneId, setSelectedSceneId] = useState(scenes[0]?.id ?? "");
  const selected = scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0];
  const [draft, setDraft] = useState<TargetingSceneDefinition | null>(() =>
    selected ? structuredClone(selected) : null,
  );
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const references = selected ? sceneReferenceCount(bundle, stage, selected.id) : 0;
  const dirty = Boolean(selected && draft && JSON.stringify(selected) !== JSON.stringify(draft));

  useEffect(() => {
    setDraft(selected ? structuredClone(selected) : null);
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
          <p className="text-xs font-semibold">TargetingScenes</p>
          <p className="text-muted-foreground text-[9px]">
            Immutable selections + spatial masks · no Group membership mutation
          </p>
        </div>
        <Button
          size="icon-xs"
          variant="outline"
          aria-label="Create TargetingScene"
          onClick={() =>
            runAction(() => {
              setSelectedSceneId(projectActions.createTargetingScene());
            })
          }
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {scenes.map((scene) => (
          <Button
            key={scene.id}
            size="xs"
            variant={scene.id === selected?.id ? "secondary" : "ghost"}
            onClick={() => setSelectedSceneId(scene.id)}
          >
            {scene.name}
          </Button>
        ))}
      </div>

      {!draft || !selected ? (
        <div className="border-border rounded-md border p-3 text-center">
          <p className="text-muted-foreground text-[10px]">
            Create a TargetingScene to sequence immutable TargetSets.
          </p>
        </div>
      ) : (
        <section className="border-border flex flex-col gap-2.5 rounded-md border p-2.5">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{selected.name}</p>
              <p className="text-muted-foreground font-mono text-[8px]">
                {selected.id} · {draft.steps.length} steps · {references} Cue refs
              </p>
            </div>
            {dirty && <Badge variant="secondary">Unsaved</Badge>}
          </div>

          <Field>
            <FieldLabel htmlFor="targeting-scene-name">Name</FieldLabel>
            <Input
              id="targeting-scene-name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-1.5">
            <Button
              size="xs"
              variant={draft.looped ? "secondary" : "outline"}
              aria-pressed={draft.looped}
              onClick={() => setDraft({ ...draft, looped: !draft.looped })}
            >
              Loop scene
            </Button>
            <Button
              size="xs"
              variant={draft.phase_continuity ? "secondary" : "outline"}
              aria-pressed={draft.phase_continuity}
              onClick={() => setDraft({ ...draft, phase_continuity: !draft.phase_continuity })}
            >
              Phase continuity
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="xs"
              variant="outline"
              onClick={() => setDraft(buildAllPartitionsAll(draft, stage))}
            >
              Build All → partitions → All
            </Button>
            <Button
              size="icon-xs"
              variant="outline"
              aria-label="Add targeting step"
              onClick={() => setDraft({ ...draft, steps: [...draft.steps, newStep(draft, stage)] })}
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            {draft.steps.map((step, index) => (
              <TargetingStepEditor
                key={step.id}
                step={step}
                index={index}
                stage={stage}
                onChange={(next) =>
                  setDraft({
                    ...draft,
                    steps: draft.steps.map((candidate) =>
                      candidate.id === step.id ? next : candidate,
                    ),
                  })
                }
                onPreview={() => previewTargetingStep(stage, step)}
                onDuplicate={() =>
                  setDraft({
                    ...draft,
                    steps: [
                      ...draft.steps.slice(0, index + 1),
                      {
                        ...structuredClone(step),
                        id: uniqueId(
                          `${step.id}-copy`,
                          draft.steps.map((candidate) => candidate.id),
                        ),
                      },
                      ...draft.steps.slice(index + 1),
                    ],
                  })
                }
                onDelete={() =>
                  draft.steps.length > 1 &&
                  setDraft({
                    ...draft,
                    steps: draft.steps.filter((candidate) => candidate.id !== step.id),
                  })
                }
              />
            ))}
          </div>

          {diagnostic && (
            <Alert variant="destructive">
              <AlertTitle>TARGETING_SCENE_ACTION_FAILED · stage.targeting_scenes</AlertTitle>
              <AlertDescription>
                {diagnostic} Review pinned Cue references and recover at this editor.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            <Button
              size="sm"
              disabled={!dirty || !draft.name.trim() || draft.steps.length === 0}
              onClick={() => runAction(() => projectActions.saveTargetingScene(selected.id, draft))}
            >
              <Save data-icon="inline-start" aria-hidden="true" />
              Save revision
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                runAction(() => {
                  setSelectedSceneId(projectActions.duplicateTargetingScene(selected.id));
                })
              }
            >
              <Copy data-icon="inline-start" aria-hidden="true" />
              Duplicate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={references > 0}
              title={references > 0 ? `Referenced by ${references} Cue revisions` : undefined}
              onClick={() =>
                runAction(() => {
                  projectActions.deleteTargetingScene(selected.id);
                  setSelectedSceneId("");
                })
              }
            >
              <Trash2 data-icon="inline-start" aria-hidden="true" />
              Delete
            </Button>
          </div>
          <FieldDescription>
            Hard switches and weighted transitions snap to beat/bar duration. Per-bar partition
            steps preserve Effect phase; saving forks Stage and referenced draft revisions only.
          </FieldDescription>
        </section>
      )}
    </div>
  );
}

function TargetingStepEditor({
  step,
  index,
  stage,
  onChange,
  onPreview,
  onDuplicate,
  onDelete,
}: {
  step: TargetingSceneStep;
  index: number;
  stage: StageDocument;
  onChange: (step: TargetingSceneStep) => void;
  onPreview: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const target = stage.target_sets.find(
    (candidate) => candidate.id === step.selection.target_set_id,
  );
  const layout = activeLayout(useProjectStore.getState().bundle);
  const partitions = target ? (resolveTargetSet(stage, layout, target)?.partitions.length ?? 1) : 1;
  const transition = step.transition;
  return (
    <div className="border-border bg-background/40 flex flex-col gap-2 rounded-md border p-2">
      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className="font-mono">
          {index + 1}
        </Badge>
        <span className="min-w-0 flex-1 truncate font-mono text-[9px]">{step.id}</span>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Preview step ${index + 1}`}
          onClick={onPreview}
        >
          <Eye aria-hidden="true" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Duplicate step ${index + 1}`}
          onClick={onDuplicate}
        >
          <Copy aria-hidden="true" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Delete step ${index + 1}`}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <Select
        value={step.selection.target_set_id}
        onValueChange={(target_set_id) =>
          target_set_id &&
          onChange({
            ...step,
            selection: { target_set_id, partition_index: null },
          })
        }
      >
        <SelectTrigger size="sm" className="w-full" aria-label={`Step ${index + 1} TargetSet`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {stage.target_sets.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <div className="grid grid-cols-3 gap-1.5">
        <NumberInput
          label="Partition"
          value={(step.selection.partition_index ?? 0) + 1}
          min={1}
          max={partitions}
          disabled={partitions <= 1}
          onChange={(value) =>
            onChange({
              ...step,
              selection: {
                ...step.selection,
                partition_index: partitions <= 1 ? null : Math.min(partitions - 1, value - 1),
              },
            })
          }
        />
        <DurationEditor
          label="Hold"
          duration={step.duration}
          onChange={(duration) => onChange({ ...step, duration })}
        />
        <Field>
          <FieldLabel>Switch</FieldLabel>
          <Select
            value={transition.type}
            onValueChange={(type) =>
              type &&
              onChange({
                ...step,
                transition:
                  type === "hard"
                    ? { type: "hard" }
                    : { type: "weighted", duration: { value: 1, unit: "beat" } },
              })
            }
          >
            <SelectTrigger size="sm" className="w-full" aria-label={`Step ${index + 1} transition`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="hard">Hard</SelectItem>
                <SelectItem value="weighted">Weighted</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {transition.type === "weighted" && (
        <DurationEditor
          label="Transition"
          duration={transition.duration}
          onChange={(duration) => onChange({ ...step, transition: { type: "weighted", duration } })}
        />
      )}
    </div>
  );
}

function DurationEditor({
  label,
  duration,
  onChange,
}: {
  label: string;
  duration: TargetingDuration;
  onChange: (duration: TargetingDuration) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-1">
        <Input
          aria-label={`${label} duration`}
          type="number"
          min={1}
          step={1}
          value={duration.value}
          className="min-w-0 flex-1 font-mono"
          onChange={(event) =>
            onChange({ ...duration, value: Math.max(1, Math.round(Number(event.target.value))) })
          }
        />
        <Select
          value={duration.unit}
          onValueChange={(unit) => unit && onChange({ ...duration, unit: unit as "beat" | "bar" })}
        >
          <SelectTrigger size="sm" className="w-16" aria-label={`${label} unit`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="beat">beat</SelectItem>
              <SelectItem value="bar">bar</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </Field>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(Math.max(min ?? 0, Math.round(Number(event.target.value))))}
      />
    </Field>
  );
}

function newStep(draft: TargetingSceneDefinition, stage: StageDocument): TargetingSceneStep {
  const id = uniqueId(
    "step",
    draft.steps.map((step) => step.id),
  );
  return {
    id,
    selection: { target_set_id: stage.target_sets[0]?.id ?? "all", partition_index: null },
    duration: { value: 1, unit: "bar" },
    transition: { type: "hard" },
  };
}

function buildAllPartitionsAll(
  draft: TargetingSceneDefinition,
  stage: StageDocument,
): TargetingSceneDefinition {
  const bundle = useProjectStore.getState().bundle;
  const layout = activeLayout(bundle);
  const all =
    stage.target_sets.find((target) => target.selector.type === "all") ?? stage.target_sets[0];
  const partitionedTargets = stage.target_sets
    .map((target) => ({
      target,
      count: resolveTargetSet(stage, layout, target)?.partitions.length ?? 0,
    }))
    .filter((candidate) => candidate.count > 1);
  const partitioned =
    partitionedTargets.find(
      ({ target }) =>
        target.selector.type === "grid_zones" &&
        target.selector.rows === 3 &&
        target.selector.columns === 3,
    ) ??
    partitionedTargets.find(({ target }) => target.selector.type === "grid_zones") ??
    partitionedTargets.sort((left, right) => right.count - left.count)[0];
  if (!all || !partitioned) return draft;
  return {
    ...draft,
    phase_continuity: true,
    steps: [
      {
        id: "all-in",
        selection: { target_set_id: all.id, partition_index: null },
        duration: { value: 1, unit: "bar" },
        transition: { type: "hard" },
      },
      ...Array.from({ length: partitioned.count }, (_, partition_index) => ({
        id: `partition-${partition_index + 1}`,
        selection: { target_set_id: partitioned.target.id, partition_index },
        duration: { value: 1 as const, unit: "bar" as const },
        transition: { type: "hard" as const },
      })),
      {
        id: "all-out",
        selection: { target_set_id: all.id, partition_index: null },
        duration: { value: 1, unit: "bar" },
        transition: { type: "weighted", duration: { value: 1, unit: "beat" } },
      },
    ],
  };
}

function previewTargetingStep(stage: StageDocument, step: TargetingSceneStep) {
  const bundle = useProjectStore.getState().bundle;
  const layout = activeLayout(bundle);
  const target = stage.target_sets.find(
    (candidate) => candidate.id === step.selection.target_set_id,
  );
  const resolved = target ? resolveTargetSet(stage, layout, target) : null;
  const fixtureIds =
    step.selection.partition_index === null || step.selection.partition_index === undefined
      ? (resolved?.fixtureIds ?? [])
      : (resolved?.partitions[step.selection.partition_index] ?? []);
  const selected = new Set(fixtureIds);
  const outputs: FixtureFramePayload[] = fixtureIdsForStage(stage).map((id) => ({
    id,
    profile_id:
      stage.patch.find((item) => id >= item.id_range[0] && id <= item.id_range[1])?.profile_id ??
      "generic-rgb",
    attributes: [
      { id: "intensity", value: { type: "scalar", value: selected.has(id) ? 1 : 0.04 } },
      {
        id: "color.rgb",
        value: { type: "color", value: selected.has(id) ? [255, 145, 40] : [8, 10, 14] },
      },
    ],
  }));
  window.dispatchEvent(new CustomEvent("workspace:test-fixtures", { detail: outputs }));
}

function sceneReferenceCount(
  bundle: ReturnType<typeof useProjectStore.getState>["bundle"],
  stage: StageDocument,
  sceneId: string,
) {
  return bundle.cues.filter(
    (cue) =>
      assetKey(cue.compatible_stage_ref) === assetKey(stage) &&
      cue.layers.some((layer) => layer.targeting_scene_ref?.targeting_scene_id === sceneId),
  ).length;
}
