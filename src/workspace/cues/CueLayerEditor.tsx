import { ArrowDown, ArrowUp, Copy, Trash2 } from "lucide-react";
import type {
  CueDefinition,
  CueLayer,
  CueTriggerMode,
  EffectDefinitionDocument,
  MixPolicy,
  StageDocument,
} from "@/bridge/types";
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
import { Separator } from "@/components/ui/separator";
import { assetKey } from "@/document/projectModel";
import type { CueLayerUpdate } from "./cueAuthoring";
import { CueOverrideControls } from "./CueOverrideControls";

export function CueLayerEditor({
  cue,
  layer,
  effect,
  effects,
  stage,
  onUpdate,
  onRemove,
  onMove,
  onDuplicate,
}: {
  cue: CueDefinition;
  layer: CueLayer;
  effect: EffectDefinitionDocument;
  effects: EffectDefinitionDocument[];
  stage: StageDocument;
  onUpdate: (update: CueLayerUpdate) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
}) {
  const effectItems = effects.map((candidate) => ({
    value: assetKey(candidate),
    label: `${candidate.name} · r${candidate.revision}`,
  }));
  const targetItems = stage.target_sets.map((target) => ({ value: target.id, label: target.name }));
  const sceneItems = [
    { value: "__static__", label: "Static TargetSet" },
    ...(stage.targeting_scenes ?? []).map((scene) => ({ value: scene.id, label: scene.name })),
  ];
  return (
    <div
      className="border-border grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-md border p-2.5"
      data-layout-region="cue-layer-editor"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">Selected layer</span>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Move selected layer up"
          onClick={() => onMove(-1)}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Move selected layer down"
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Duplicate selected layer"
          onClick={onDuplicate}
        >
          <Copy aria-hidden="true" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Remove selected layer"
          disabled={cue.layers.length <= 1}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>

      <Field>
        <FieldLabel>Effect revision</FieldLabel>
        <Select
          items={effectItems}
          value={assetKey(layer.effect_ref)}
          onValueChange={(value) => {
            if (!value) return;
            const next = effects.find((candidate) => assetKey(candidate) === value);
            if (!next) return;
            onUpdate((draftLayer, draftCue) => {
              draftLayer.effect_ref = { id: next.id, revision: next.revision };
              draftLayer.parameter_overrides = {};
              draftCue.automation_lanes = (draftCue.automation_lanes ?? []).filter(
                (lane) => lane.target.layer_id !== draftLayer.id,
              );
            });
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {effectItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          Switching revisions explicitly clears incompatible overrides and automation lanes.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>TargetSet</FieldLabel>
        <ValueSelect
          value={layer.target_set_ref.target_set_id}
          items={targetItems}
          onChange={(value) =>
            onUpdate((draftLayer) => {
              draftLayer.target_set_ref = {
                ...draftLayer.target_set_ref,
                target_set_id: value,
              };
            })
          }
        />
      </Field>

      <Field>
        <FieldLabel>TargetingScene / Spatial Mask</FieldLabel>
        <ValueSelect
          value={layer.targeting_scene_ref?.targeting_scene_id ?? "__static__"}
          items={sceneItems}
          onChange={(value) =>
            onUpdate((draftLayer) => {
              draftLayer.targeting_scene_ref =
                value === "__static__"
                  ? null
                  : {
                      stage_id: stage.id,
                      stage_revision: stage.revision,
                      targeting_scene_id: value,
                    };
            })
          }
        />
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label="Phase"
          value={layer.phase}
          step={0.01}
          onChange={(value) =>
            onUpdate((draftLayer) => {
              draftLayer.phase = value;
            })
          }
        />
        <NumberField
          label="Layer"
          value={layer.layer ?? 0}
          step={1}
          onChange={(value) =>
            onUpdate((draftLayer) => {
              draftLayer.layer = value;
            })
          }
        />
        <NumberField
          label="Priority"
          value={layer.priority ?? 0}
          step={1}
          onChange={(value) =>
            onUpdate((draftLayer) => {
              draftLayer.priority = value;
            })
          }
        />
      </div>

      <Field>
        <FieldLabel htmlFor={`${layer.id}-seed`}>Deterministic seed</FieldLabel>
        <Input
          id={`${layer.id}-seed`}
          className="font-mono"
          value={layer.seed}
          maxLength={16}
          onChange={(event) =>
            onUpdate((draftLayer) => {
              draftLayer.seed = event.currentTarget.value;
            })
          }
        />
        <FieldDescription>
          Exactly 16 hexadecimal characters; invalid text remains local.
        </FieldDescription>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Intensity mix"
          value={
            layer.mix_overrides?.find((item) => item.attribute_id === "intensity")?.policy ?? "htp"
          }
          items={MIX_ITEMS}
          onChange={(value) =>
            onUpdate((draftLayer) => {
              draftLayer.mix_overrides = [
                ...(draftLayer.mix_overrides ?? []).filter(
                  (item) => item.attribute_id !== "intensity",
                ),
                { attribute_id: "intensity", policy: value as MixPolicy },
              ];
            })
          }
        />
        <SelectField
          label="Trigger"
          value={layer.trigger_policy.mode}
          items={TRIGGER_ITEMS}
          onChange={(value) =>
            onUpdate((draftLayer) => {
              draftLayer.trigger_policy = {
                ...draftLayer.trigger_policy,
                mode: value as CueTriggerMode,
              };
            })
          }
        />
      </div>

      <Separator />
      <p className="text-xs font-medium">Parameter defaults / overrides</p>
      <CueOverrideControls cue={cue} layer={layer} effect={effect} onUpdate={onUpdate} />
    </div>
  );
}

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </Field>
  );
}

function SelectField({
  label,
  ...props
}: {
  label: string;
  value: string;
  items: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <ValueSelect {...props} />
    </Field>
  );
}

function ValueSelect({
  value,
  items,
  onChange,
}: {
  value: string;
  items: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Select items={items} value={value} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

const MIX_ITEMS = ["htp", "ltp", "add", "multiply", "mask"].map((value) => ({
  value,
  label: value.toUpperCase(),
}));
const TRIGGER_ITEMS = ["timeline", "toggle", "momentary", "one_shot"].map((value) => ({
  value,
  label: value.replace("_", " "),
}));
