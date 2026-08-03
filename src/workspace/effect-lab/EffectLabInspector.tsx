import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { engineActions, engineSelectors, useEngineStore } from "@/stores/engine";
import { useWorkspaceStore, workspaceActions, workspaceSelectors } from "@/stores/workspace";
import {
  effectFormValues,
  effectWaveforms,
  primaryInstance,
  reviseEffectPair,
  type EffectAttributeMode,
  type EffectFormValues,
} from "./effectFactory";
import { EffectParameterControls, effectNumbersAreValid } from "./EffectParameterControls";

export function EffectLabInspector() {
  const document = useEngineStore(engineSelectors.parsedDsl);
  const selectedEffectId = useWorkspaceStore(workspaceSelectors.selectedEffectId);
  const definition = document?.effect_definitions.find((item) => item.id === selectedEffectId);
  const instance = document && definition ? primaryInstance(document, definition.id) : undefined;
  const savedValues = useMemo(
    () => (definition && instance ? effectFormValues(definition, instance) : null),
    [definition, instance],
  );
  const [values, setValues] = useState<EffectFormValues | null>(savedValues);

  useEffect(() => setValues(savedValues), [savedValues]);

  if (!document || !definition || !instance || !values || !savedValues) {
    return (
      <aside
        className="bg-card flex h-full items-center justify-center p-4"
        aria-label="Effect inspector"
      >
        <p className="text-muted-foreground text-center text-xs">
          Create or select an effect to edit its reusable revision.
        </p>
      </aside>
    );
  }

  const invalid =
    !values.name.trim() ||
    !/^#[0-9a-f]{6}$/i.test(values.color) ||
    !document.groups.some((group) => group.id === values.targetGroupId) ||
    !effectNumbersAreValid(values);
  const edited = JSON.stringify(values) !== JSON.stringify(savedValues);
  const update = <Key extends keyof EffectFormValues>(key: Key, value: EffectFormValues[Key]) =>
    setValues((current) => (current ? { ...current, [key]: value } : current));

  const saveRevision = () => {
    if (invalid) return;
    try {
      const revised = reviseEffectPair(definition, instance, values);
      engineActions.applyDocumentTransaction({
        id: crypto.randomUUID(),
        label: `Save ${values.name} revision ${revised.definition.revision}`,
        commands: [
          {
            type: "revise_effect",
            definition_id: definition.id,
            definition: revised.definition,
            primary_instance: revised.instance,
          },
        ],
      });
      workspaceActions.setPublishStatus(
        "idle",
        `${values.name} revision ${revised.definition.revision} saved to Draft.`,
      );
    } catch (error) {
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : "Effect revision could not be saved.",
      );
    }
  };

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label="Effect Lab inspector">
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <FlaskConical className="text-primary size-3.5" aria-hidden="true" />
        <span className="text-xs font-medium">Effect controls</span>
        <Badge variant={edited ? "outline" : "secondary"} className="ml-auto">
          r{definition.revision}
          {edited ? " • edited" : ""}
        </Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-2.5">
          <Field label="Effect name" id="effect-name">
            <Input
              id="effect-name"
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="Target group"
              value={values.targetGroupId}
              onChange={(value) => update("targetGroupId", value)}
              options={document.groups.map((group) => ({ value: group.id, label: group.name }))}
            />
            <SelectField
              label="Attributes"
              value={values.attributeMode}
              onChange={(value) => update("attributeMode", value as EffectAttributeMode)}
              options={[
                { value: "intensity_color", label: "Intensity + color" },
                { value: "intensity", label: "Intensity" },
              ]}
            />
          </div>

          <SelectField
            label="Waveform"
            value={values.waveform}
            onChange={(value) => update("waveform", value as EffectFormValues["waveform"])}
            options={effectWaveforms.map((waveform) => ({
              value: waveform,
              label: waveform[0].toUpperCase() + waveform.slice(1),
            }))}
          />

          <EffectParameterControls values={values} onChange={(key, value) => update(key, value)} />

          <Field label="Color" id="effect-color">
            <div className="flex gap-2">
              <Input
                id="effect-color"
                type="color"
                value={values.color}
                disabled={values.attributeMode === "intensity"}
                className="w-11 shrink-0 p-1"
                onChange={(event) => update("color", event.target.value)}
              />
              <Input
                aria-label="Effect color hex value"
                value={values.color}
                disabled={values.attributeMode === "intensity"}
                className="font-mono uppercase"
                onChange={(event) => update("color", event.target.value)}
              />
            </div>
          </Field>

          <Button size="sm" disabled={!edited || invalid} onClick={saveRevision}>
            <Save data-icon="inline-start" aria-hidden="true" />
            Save revision r{definition.revision + 1}
          </Button>
          <p className="text-muted-foreground text-[10px] leading-relaxed">
            Saving changes Draft only. Publish and Take live remain explicit show-level actions.
          </p>
        </div>
      </ScrollArea>
    </aside>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[10px]">
        {label}
      </Label>
      {children}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const id = `effect-${label.toLowerCase().replace(/ /g, "-")}`;
  return (
    <Field label={label} id={id}>
      <Select value={value} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
