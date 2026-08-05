import { useEffect, useState } from "react";
import { FlaskConical, Save } from "lucide-react";
import { BeatSyncSpeedSelect } from "@/authoring/BeatSyncSpeedSelect";
import { isBeatSyncSpeedMultiplier } from "@/authoring/speedMultipliers";
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
import { activeStage, exactAsset } from "@/document/projectModel";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { workspaceActions } from "@/stores/workspace";

export function EffectLabInspector() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const reference = useProjectStore(projectSelectors.selectedEffectRef);
  const targetSetId = useProjectStore(projectSelectors.selectedTargetSetId);
  const effect = exactAsset(bundle.effects, reference);
  const stage = activeStage(bundle);
  const speed = effect?.parameters.find((parameter) => parameter.id === "speed");
  const speedValue = speed?.default_value.type === "scalar" ? speed.default_value.value : 1;
  const [name, setName] = useState(effect?.name ?? "");
  const [defaultSpeed, setDefaultSpeed] = useState(speedValue);

  useEffect(() => {
    setName(effect?.name ?? "");
    setDefaultSpeed(speedValue);
  }, [effect, speedValue]);

  if (!effect || !reference) {
    return (
      <aside
        className="bg-card flex h-full items-center justify-center p-4"
        aria-label="Effect inspector"
      >
        <p className="text-muted-foreground text-center text-xs">
          Create or select a target-agnostic Effect revision.
        </p>
      </aside>
    );
  }

  const targetItems = stage.target_sets.map((target) => ({
    value: target.id,
    label: target.name,
  }));
  const edited = name.trim() !== effect.name || defaultSpeed !== speedValue;
  const save = () => {
    if (!name.trim() || !isBeatSyncSpeedMultiplier(defaultSpeed)) {
      return;
    }
    projectActions.updateEffect(reference, `Edit Effect ${effect.name}`, (draft) => {
      draft.name = name.trim();
      const parameter = draft.parameters.find((candidate) => candidate.id === "speed");
      if (parameter) parameter.default_value = { type: "scalar", value: defaultSpeed };
    });
    workspaceActions.setPublishStatus("idle", `${name.trim()} saved to Draft.`);
  };

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label="Effect Lab inspector">
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <FlaskConical className="text-primary" aria-hidden="true" />
        <span className="text-xs font-medium">Effect controls</span>
        <Badge variant="secondary" className="ml-auto">
          target-agnostic · r{effect.revision}
        </Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="effect-name">Effect name</FieldLabel>
              <Input
                id="effect-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="effect-speed">Default speed</FieldLabel>
              <BeatSyncSpeedSelect
                id="effect-speed"
                value={defaultSpeed}
                onChange={(value) => value !== null && setDefaultSpeed(value)}
              />
              <FieldDescription>
                Beat-synced ratio relative to the Arrangement BPM.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="effect-preview-target">Preview TargetSet</FieldLabel>
              <Select
                items={targetItems}
                value={targetSetId}
                onValueChange={(value) => value && projectActions.setSelectedTargetSetId(value)}
              >
                <SelectTrigger id="effect-preview-target" size="sm" className="w-full">
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
              <FieldDescription>
                This selection belongs to PreviewSession. It is never written into the Effect asset.
              </FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {(effect.catalog.required_attributes ?? []).map((attribute) => (
                <Badge key={attribute} variant="outline">
                  {attribute}
                </Badge>
              ))}
              <Badge variant={effect.catalog.strobe_risk === "high" ? "destructive" : "secondary"}>
                {effect.catalog.strobe_risk} risk
              </Badge>
            </div>
            <Button size="sm" disabled={!edited} onClick={save}>
              <Save data-icon="inline-start" aria-hidden="true" />
              Save Draft revision
            </Button>
          </FieldGroup>
        </div>
      </ScrollArea>
    </aside>
  );
}
