import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Lightbulb, Save, Shapes } from "lucide-react";
import { engine } from "@/bridge/commands";
import type { FullDSL } from "@/bridge/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { StageGroupEditor } from "./StageGroupEditor";
import {
  buildLayout,
  channelFootprint,
  diagnoseLayout,
  diagnosePatch,
  type EditableLayoutShape,
  fixtureIdsForPatch,
  fixtureProfiles,
  layoutParametersFromLayout,
  profileById,
} from "./stageSetup";
import { StageLayoutEditor } from "./StageLayoutEditor";

export function StageSetupInspector() {
  const document = useEngineStore(engineSelectors.parsedDsl);
  const patchAddresses = useWorkspaceStore(workspaceSelectors.patchAddresses);
  const firstPatch = document?.patch[0];
  const initialCount = firstPatch ? firstPatch.id_range[1] - firstPatch.id_range[0] + 1 : 1;
  const [profileId, setProfileId] = useState(firstPatch?.profile_id ?? "generic-rgb");
  const [firstId, setFirstId] = useState(firstPatch?.id_range[0] ?? 1);
  const [count, setCount] = useState(initialCount);
  const initialFixtureIds = firstPatch ? fixtureIdsForPatch([firstPatch]) : [1];
  const [layoutParameters, setLayoutParameters] = useState(() =>
    layoutParametersFromLayout(document?.layout, initialFixtureIds),
  );
  const [shape, setShape] = useState<EditableLayoutShape>(editableShape(document));
  const address = patchAddresses[0] ?? { universe: 1, startChannel: 1 };
  const profile = profileById(profileId);
  const patch = useMemo(
    () => [
      {
        profile_id: profileId,
        id_range: [firstId, firstId + Math.max(1, count) - 1] as [number, number],
      },
    ],
    [count, firstId, profileId],
  );
  const fixtureIds = useMemo(() => fixtureIdsForPatch(patch), [patch]);
  const diagnostics = [
    ...diagnosePatch(patch, [address]),
    ...diagnoseLayout(shape, fixtureIds, layoutParameters),
  ];
  const invalid = diagnostics.some((diagnostic) => diagnostic.severity === "error");

  useEffect(() => {
    if (!firstPatch) return;
    setProfileId(firstPatch.profile_id);
    setFirstId(firstPatch.id_range[0]);
    setCount(firstPatch.id_range[1] - firstPatch.id_range[0] + 1);
  }, [firstPatch]);

  useEffect(() => {
    if (!document) return;
    setShape(editableShape(document));
    setLayoutParameters(
      layoutParametersFromLayout(document.layout, fixtureIdsForPatch(document.patch)),
    );
  }, [document]);

  const applySetup = async () => {
    if (!document || invalid) return;
    const groups = reconcileGroups(document, fixtureIds);
    const layout = buildLayout(shape, fixtureIds, layoutParameters);
    try {
      engineActions.applyDocumentTransaction({
        id: crypto.randomUUID(),
        label: "Update stage setup",
        commands: [{ type: "replace_stage_setup", patch, layout, groups }],
      });
      const nextDocument = useEngineStore.getState().parsedDsl;
      if (!nextDocument) return;
      engineActions.setCompileStatus("compiling");
      const preview = await engine.previewDSL(JSON.stringify(nextDocument));
      engineActions.setCompileErrors(preview.errors);
      engineActions.setCompileStatus(preview.success ? "success" : "error");
      if (preview.success) {
        window.dispatchEvent(
          new CustomEvent("engine:draft-layout", { detail: preview.layout_coords }),
        );
        workspaceActions.setPublishStatus("idle", "Stage setup saved to Draft.");
      }
    } catch (error) {
      engineActions.setCompileStatus("error");
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : "Stage setup could not be applied.",
      );
    }
  };

  if (!document) return null;

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label="Stage setup inspector">
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <Lightbulb className="text-muted-foreground size-3.5" aria-hidden="true" />
        <span className="text-xs font-medium">Stage setup</span>
        <Badge variant="outline" className="ml-auto">
          Draft
        </Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 p-2.5">
          <section className="border-border flex flex-col gap-2.5 rounded-md border p-2.5">
            <div className="flex items-center gap-2">
              <Shapes className="text-primary size-3.5" aria-hidden="true" />
              <h2 className="text-xs font-semibold">Fixture patch</h2>
              <span className="text-muted-foreground ml-auto font-mono text-[10px]">
                {channelFootprint(profile)} ch / fixture
              </span>
            </div>

            <Field label="Fixture profile" id="stage-profile">
              <Select value={profileId} onValueChange={(value) => value && setProfileId(value)}>
                <SelectTrigger id="stage-profile" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {fixtureProfiles.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <NumberField label="First fixture ID" value={firstId} min={1} onChange={setFirstId} />
              <NumberField label="Quantity" value={count} min={1} onChange={setCount} />
              <NumberField
                label="Universe"
                value={address.universe}
                min={1}
                onChange={(universe) =>
                  workspaceActions.setPatchAddress(0, { ...address, universe })
                }
              />
              <NumberField
                label="Start channel"
                value={address.startChannel}
                min={1}
                max={512}
                onChange={(startChannel) =>
                  workspaceActions.setPatchAddress(0, { ...address, startChannel })
                }
              />
            </div>

            <Field label="Layout" id="stage-layout">
              <Select
                value={shape}
                onValueChange={(value) => value && setShape(value as EditableLayoutShape)}
              >
                <SelectTrigger id="stage-layout" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="matrix">Matrix</SelectItem>
                    <SelectItem value="circle">Circle</SelectItem>
                    <SelectItem value="formula">Formula</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <StageLayoutEditor
              shape={shape}
              fixtureIds={fixtureIds}
              parameters={layoutParameters}
              onChange={setLayoutParameters}
            />

            <div className="flex flex-wrap gap-1">
              {profile.attributes.map((attribute) => (
                <Badge key={attribute.id} variant="secondary">
                  {attribute.id}
                </Badge>
              ))}
            </div>

            {diagnostics.map((diagnostic) => (
              <Alert key={diagnostic.message} variant="destructive">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Patch conflict</AlertTitle>
                <AlertDescription>{diagnostic.message}</AlertDescription>
              </Alert>
            ))}
            {diagnostics.length === 0 && (
              <div className="text-muted-foreground flex items-center gap-1.5 text-[10px]">
                <CheckCircle2 className="size-3 text-emerald-400" aria-hidden="true" />
                Universe {address.universe}, channels {address.startChannel}–
                {address.startChannel + count * channelFootprint(profile) - 1}
              </div>
            )}

            <Button size="sm" onClick={() => void applySetup()} disabled={invalid}>
              <Save data-icon="inline-start" aria-hidden="true" />
              Apply to Draft
            </Button>
          </section>

          <StageGroupEditor document={document} />
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

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const id = `stage-${label.toLowerCase().replace(/ /g, "-")}`;
  return (
    <Field label={label} id={id}>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

function editableShape(document: FullDSL | null): EditableLayoutShape {
  const shape = document?.layout.generator.shape;
  return shape === "matrix" || shape === "circle" || shape === "formula" || shape === "custom"
    ? shape
    : "custom";
}

function reconcileGroups(document: FullDSL, fixtureIds: number[]) {
  const minimum = fixtureIds[0] ?? 1;
  const maximum = fixtureIds[fixtureIds.length - 1] ?? minimum;
  const existing = document.groups.filter((group) => group.id !== "all-fixtures");
  const retained = existing.flatMap((group) => {
    const groupFixtures = group.fixtures;
    const fixtures = Array.isArray(groupFixtures)
      ? groupFixtures.filter((id) => fixtureIds.includes(id))
      : {
          range: [
            Math.max(minimum, groupFixtures.range[0]),
            Math.min(maximum, groupFixtures.range[1]),
          ] as [number, number],
        };
    if (Array.isArray(fixtures) && fixtures.length === 0) return [];
    if (!Array.isArray(fixtures) && fixtures.range[1] < fixtures.range[0]) return [];
    return [{ ...group, fixtures }];
  });
  return [
    {
      id: "all-fixtures",
      name: "All fixtures",
      fixtures: { range: [minimum, maximum] as [number, number] },
      sort_by: "none" as const,
    },
    ...retained,
  ];
}
