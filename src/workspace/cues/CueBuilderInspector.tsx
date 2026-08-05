import { useEffect, useMemo, useState } from "react";
import { Copy, Layers2, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { CueTriggerMode, MixPolicy } from "@/bridge/types";
import { BeatSyncSpeedSelect } from "@/authoring/BeatSyncSpeedSelect";
import { assetKey, exactAsset } from "@/document/projectModel";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { workspaceActions } from "@/stores/workspace";

export function CueBuilderInspector() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const reference = useProjectStore(projectSelectors.selectedCueRef);
  const selectedEffectRef = useProjectStore(projectSelectors.selectedEffectRef);
  const cue = exactAsset(bundle.cues, reference);
  const stage = cue ? exactAsset(bundle.stages, cue.compatible_stage_ref) : undefined;
  const [name, setName] = useState(cue?.name ?? "");

  useEffect(() => setName(cue?.name ?? ""), [cue]);

  const summary = useMemo(() => {
    const capabilities = new Set<string>();
    let risk: "none" | "low" | "medium" | "high" = "none";
    for (const layer of cue?.layers ?? []) {
      const effect = exactAsset(bundle.effects, layer.effect_ref);
      for (const attribute of effect?.catalog.required_attributes ?? [])
        capabilities.add(attribute);
      if (effect?.catalog.strobe_risk === "high") risk = "high";
      else if (effect?.catalog.strobe_risk === "medium" && risk !== "high") risk = "medium";
      else if (effect?.catalog.strobe_risk === "low" && risk === "none") risk = "low";
    }
    return { capabilities: [...capabilities], risk };
  }, [bundle.effects, cue]);

  if (!cue || !reference || !stage) {
    return (
      <aside
        className="bg-card flex h-full items-center justify-center p-4"
        aria-label="Cue Builder"
      >
        <p className="text-muted-foreground text-center text-xs">
          Select an Effect, then create a Cue to combine one or more layers.
        </p>
      </aside>
    );
  }

  const effectItems = bundle.manifest.effect_refs.map((candidate) => ({
    value: assetKey(candidate),
    label: exactAsset(bundle.effects, candidate)?.name ?? `${candidate.id} r${candidate.revision}`,
  }));
  const targetItems = stage.target_sets.map((target) => ({
    value: target.id,
    label: target.name,
  }));
  const targetingSceneItems = [
    { value: "__static__", label: "Static TargetSet" },
    ...(stage.targeting_scenes ?? []).map((scene) => ({ value: scene.id, label: scene.name })),
  ];
  const saveName = () => {
    if (name.trim() && name.trim() !== cue.name) projectActions.renameCue(reference, name.trim());
  };
  const remove = () => {
    try {
      projectActions.deleteCue(reference);
    } catch (error) {
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : "Cue could not be deleted.",
      );
    }
  };

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label="Cue Builder">
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <Layers2 className="text-primary" aria-hidden="true" />
        <span className="text-xs font-medium">Cue Builder</span>
        <Badge variant="outline" className="ml-auto">
          r{cue.revision}
        </Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cue-name">Cue name</FieldLabel>
              <div className="flex gap-1.5">
                <Input
                  id="cue-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <Button
                  size="icon-sm"
                  aria-label="Save Cue name"
                  disabled={!name.trim()}
                  onClick={saveName}
                >
                  <Save aria-hidden="true" />
                </Button>
              </div>
            </Field>
            <div className="flex gap-1.5">
              <Button
                size="xs"
                variant="outline"
                onClick={() => projectActions.duplicateCue(reference)}
              >
                <Copy data-icon="inline-start" aria-hidden="true" />
                Duplicate
              </Button>
              <Button size="xs" variant="destructive" onClick={remove}>
                <Trash2 data-icon="inline-start" aria-hidden="true" />
                Delete
              </Button>
            </div>
          </FieldGroup>

          <Separator />

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">Effect layers</span>
            <Button
              size="xs"
              variant="outline"
              disabled={!selectedEffectRef}
              onClick={() =>
                selectedEffectRef && projectActions.addCueLayer(reference, selectedEffectRef)
              }
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              Add selected Effect
            </Button>
          </div>

          {cue.layers.map((layer, index) => {
            const layerEffect = exactAsset(bundle.effects, layer.effect_ref);
            const speedOverride = layer.parameter_overrides?.speed;
            const speedOverrideValue =
              speedOverride?.type === "scalar" ? String(speedOverride.value) : "";
            const intensityMix =
              layer.mix_overrides?.find((override) => override.attribute_id === "intensity")
                ?.policy ?? "htp";
            return (
              <div
                key={layer.id}
                className="border-border flex flex-col gap-2 rounded-md border p-2.5"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">L{index + 1}</Badge>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {layerEffect?.name ?? layer.id}
                  </span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Remove layer ${index + 1}`}
                    disabled={cue.layers.length <= 1}
                    onClick={() => projectActions.removeCueLayer(reference, layer.id)}
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
                      const effectRef = bundle.manifest.effect_refs.find(
                        (candidate) => assetKey(candidate) === value,
                      );
                      if (effectRef)
                        projectActions.updateCueLayer(reference, layer.id, {
                          effect_ref: effectRef,
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
                </Field>
                <Field>
                  <FieldLabel>TargetSet</FieldLabel>
                  <Select
                    items={targetItems}
                    value={layer.target_set_ref.target_set_id}
                    onValueChange={(value) =>
                      value &&
                      projectActions.updateCueLayer(reference, layer.id, {
                        target_set_ref: { ...layer.target_set_ref, target_set_id: value },
                      })
                    }
                  >
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {targetItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>TargetingScene / Spatial Mask</FieldLabel>
                  <Select
                    items={targetingSceneItems}
                    value={layer.targeting_scene_ref?.targeting_scene_id ?? "__static__"}
                    onValueChange={(value) =>
                      value &&
                      projectActions.updateCueLayer(reference, layer.id, {
                        targeting_scene_ref:
                          value === "__static__"
                            ? null
                            : {
                                stage_id: stage.id,
                                stage_revision: stage.revision,
                                targeting_scene_id: value,
                              },
                      })
                    }
                  >
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {targetingSceneItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Scene selection changes immutable fixture weights; Effect phase remains
                    continuous when the scene requests it.
                  </FieldDescription>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field>
                    <FieldLabel htmlFor={`${layer.id}-phase`}>Phase</FieldLabel>
                    <Input
                      id={`${layer.id}-phase`}
                      type="number"
                      step={0.01}
                      defaultValue={layer.phase}
                      onBlur={(event) =>
                        projectActions.updateCueLayer(reference, layer.id, {
                          phase: Number(event.currentTarget.value),
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${layer.id}-priority`}>Priority</FieldLabel>
                    <Input
                      id={`${layer.id}-priority`}
                      type="number"
                      step={1}
                      defaultValue={layer.priority ?? 0}
                      onBlur={(event) =>
                        projectActions.updateCueLayer(reference, layer.id, {
                          priority: Number(event.currentTarget.value),
                        })
                      }
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field>
                    <FieldLabel>Intensity mix</FieldLabel>
                    <Select
                      items={MIX_ITEMS}
                      value={intensityMix}
                      onValueChange={(value) => {
                        if (!value) return;
                        projectActions.updateCueLayer(reference, layer.id, {
                          mix_overrides: [
                            ...(layer.mix_overrides ?? []).filter(
                              (override) => override.attribute_id !== "intensity",
                            ),
                            { attribute_id: "intensity", policy: value as MixPolicy },
                          ],
                        });
                      }}
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          {MIX_ITEMS.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Trigger</FieldLabel>
                    <Select
                      items={TRIGGER_ITEMS}
                      value={layer.trigger_policy.mode}
                      onValueChange={(value) =>
                        value &&
                        projectActions.updateCueLayer(reference, layer.id, {
                          trigger_policy: {
                            ...layer.trigger_policy,
                            mode: value as CueTriggerMode,
                          },
                        })
                      }
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          {TRIGGER_ITEMS.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field>
                  <FieldLabel>Speed override</FieldLabel>
                  <BeatSyncSpeedSelect
                    id={`${layer.id}-speed-override`}
                    value={speedOverrideValue ? Number(speedOverrideValue) : null}
                    defaultLabel="Use Effect default"
                    onChange={(value) => {
                      const parameterOverrides = { ...(layer.parameter_overrides ?? {}) };
                      if (value === null) delete parameterOverrides.speed;
                      else parameterOverrides.speed = { type: "scalar", value };
                      projectActions.updateCueLayer(reference, layer.id, {
                        parameter_overrides: parameterOverrides,
                      });
                    }}
                  />
                  <FieldDescription>
                    Beat-synced ratios only: 0.25×, 0.5×, 1×, 2×, 4×, or 8×.
                  </FieldDescription>
                </Field>
                <FieldDescription>
                  Effect r{layer.effect_ref.revision} · seed {layer.seed.slice(-6)} ·{" "}
                  {layer.trigger_policy.mode}
                </FieldDescription>
              </div>
            );
          })}

          <Separator />
          <div className="flex flex-wrap gap-1.5" aria-label="Cue capability and risk summary">
            {summary.capabilities.map((attribute) => (
              <Badge key={attribute} variant="outline">
                {attribute}
              </Badge>
            ))}
            <Badge variant={summary.risk === "high" ? "destructive" : "secondary"}>
              {summary.risk} risk
            </Badge>
          </div>
        </div>
      </ScrollArea>
    </aside>
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
