import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Cable,
  Copy,
  Eye,
  LayoutTemplate,
  PencilLine,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { engine } from "@/bridge/commands";
import type { Diagnostic, LayoutDefinition } from "@/bridge/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  diagnoseLayoutDefinition,
  fixtureIdsForStage,
  layoutCapacity,
  layoutStageCapacityDiagnostic,
} from "@/document/layoutDefinition";
import { activeLayout, activeStage, assetKey, exactAsset } from "@/document/projectModel";
import { analyzeStageTopology } from "@/document/stageTopology";
import { cn } from "@/lib/utils";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { useWorkspaceStore, workspaceActions, workspaceSelectors } from "@/stores/workspace";
import { materializeStagePreviewBundle } from "../authoringPreviewBundle";
import { LayoutGeometryEditor } from "./LayoutGeometryEditor";
import {
  StageCollectionEditorDialog,
  StageCollectionEditorLauncher,
  type StageCollectionEditorKind,
} from "./StageCollectionEditorDialog";
import { StageLayoutImpactPanel } from "./StageLayoutImpactPanel";
import { StagePatchDialog } from "./StagePatchDialog";
import { TargetingSceneEditor } from "./TargetingSceneEditor";

type SaveAsState = "closed" | "open";

export function ProjectStageInspector() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const selectedLayoutRef = useProjectStore(projectSelectors.selectedLayoutRef);
  const selectedArrangementRef = useProjectStore(projectSelectors.selectedArrangementRef);
  const advancedMode = useWorkspaceStore(workspaceSelectors.advancedMode);
  const stage = activeStage(bundle);
  const stageLayout = activeLayout(bundle);
  const selectedLayout = exactAsset(bundle.layouts, selectedLayoutRef) ?? stageLayout;
  const [draft, setDraft] = useState<LayoutDefinition>(() => structuredClone(selectedLayout));
  const [previewDiagnostics, setPreviewDiagnostics] = useState<Diagnostic[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [saveAsState, setSaveAsState] = useState<SaveAsState>("closed");
  const [saveAsName, setSaveAsName] = useState(`${selectedLayout.name} Copy`);
  const [actionDiagnostic, setActionDiagnostic] = useState<Diagnostic | null>(null);
  const [impactOpen, setImpactOpen] = useState(false);
  const [patchOpen, setPatchOpen] = useState(false);
  const [collectionEditorOpen, setCollectionEditorOpen] = useState(false);
  const [collectionEditorKind, setCollectionEditorKind] =
    useState<StageCollectionEditorKind>("groups");
  const [view, setView] = useState<"layout" | "groups" | "targets" | "scenes">("layout");
  const fixtureIds = useMemo(() => fixtureIdsForStage(stage), [stage]);
  const localDiagnostics = useMemo(
    () => diagnoseLayoutDefinition(draft, fixtureIds),
    [draft, fixtureIds],
  );
  const blockingDiagnostics = localDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  const capacityDiagnostic = useMemo(
    () => layoutStageCapacityDiagnostic(draft, fixtureIds),
    [draft, fixtureIds],
  );
  const selectedLayoutFingerprint = JSON.stringify(selectedLayout);
  const usedOnStage = assetKey(stage.layout_ref) === assetKey(selectedLayoutRef);
  const dirty = JSON.stringify(draft) !== JSON.stringify(selectedLayout);
  const editable = draft.editor.mode !== "read_only";

  useEffect(() => {
    setDraft(structuredClone(selectedLayout));
    setSaveAsName(`${selectedLayout.name} Copy`);
    setSaveAsState("closed");
    setActionDiagnostic(null);
    setImpactOpen(false);
  }, [selectedLayoutFingerprint]);

  useEffect(() => {
    if (view !== "layout") return;
    if (blockingDiagnostics.length > 0) {
      setPreviewDiagnostics([]);
      setPreviewing(false);
      return;
    }
    const request = new AbortController();
    setPreviewing(true);
    const timer = window.setTimeout(() => {
      void engine
        .previewLayout(draft, stage)
        .then((coords) => {
          if (request.signal.aborted) return;
          setPreviewDiagnostics([]);
          window.dispatchEvent(new CustomEvent("engine:layout-draft-coords", { detail: coords }));
        })
        .catch((error) => {
          if (request.signal.aborted) return;
          setPreviewDiagnostics(normalizeDiagnostics(error, "layout.preview"));
        })
        .finally(() => {
          if (!request.signal.aborted) setPreviewing(false);
        });
    }, 100);
    return () => {
      request.abort();
      window.clearTimeout(timer);
    };
  }, [blockingDiagnostics.length, draft, stage, view]);

  useEffect(() => {
    if (view === "layout") return;
    let active = true;
    void engine
      .previewProject({
        project: materializeStagePreviewBundle(bundle, selectedArrangementRef),
        arrangementRef: selectedArrangementRef,
        source: { type: "authoring_draft" },
        context: { type: "stage" },
        playheadTick: 0,
      })
      .then((frame) => {
        if (!active) return;
        window.dispatchEvent(new CustomEvent("engine:project-preview-frame", { detail: frame }));
      })
      .catch((error) => {
        if (active) setPreviewDiagnostics(normalizeDiagnostics(error, "stage.preview"));
      });
    return () => {
      active = false;
    };
  }, [bundle, selectedArrangementRef, view]);

  const runAction = (path: string, action: () => void) => {
    try {
      action();
      setActionDiagnostic(null);
    } catch (error) {
      setActionDiagnostic(normalizeDiagnostics(error, path)[0]);
    }
  };

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label="Stage inspector">
      <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <LayoutTemplate className="text-primary size-3.5" aria-hidden="true" />
        <span className="text-xs font-medium">Stage setup</span>
        {dirty && <Badge variant="secondary">Unsaved</Badge>}
        {!dirty && (
          <Badge variant="outline" className="ml-auto">
            Ready
          </Badge>
        )}
      </div>
      {advancedMode && (
        <div className="border-border flex shrink-0 items-center border-b px-2 py-1.5">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[view]}
            onValueChange={(value) => {
              const next = value[0];
              if (
                next === "layout" ||
                next === "groups" ||
                next === "targets" ||
                next === "scenes"
              ) {
                setView(next);
                if (next === "groups" || next === "targets") {
                  setCollectionEditorKind(next);
                  setCollectionEditorOpen(true);
                } else {
                  setCollectionEditorOpen(false);
                }
              }
            }}
            aria-label="Stage secondary editor"
            className="w-full"
          >
            <ToggleGroupItem value="layout" className="min-w-0 flex-1">
              Setup
            </ToggleGroupItem>
            <ToggleGroupItem value="groups" className="min-w-0 flex-1">
              Groups
            </ToggleGroupItem>
            <ToggleGroupItem value="targets" className="min-w-0 flex-1">
              Areas
            </ToggleGroupItem>
            <ToggleGroupItem value="scenes" className="min-w-0 flex-1">
              Scenes
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      <section
        className="border-border flex shrink-0 flex-col gap-2 border-b p-2"
        aria-label="Layout asset controls"
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{selectedLayout.name}</p>
            <p className="text-muted-foreground text-[9px]">Fixture layout</p>
          </div>
          {usedOnStage && <Badge variant="secondary">On Stage</Badge>}
          {advancedMode && <Badge variant="outline">{draft.editor.mode}</Badge>}
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border">
          <Metric label="Shape" value={draft.geometry.shape} />
          <Metric label="Positions" value={String(layoutCapacity(draft))} />
          <Metric label="Patched" value={String(fixtureIds.length)} />
        </div>
        <div className={cn("grid gap-1.5", advancedMode ? "grid-cols-3" : "grid-cols-2")}>
          <Button
            size="xs"
            disabled={!dirty || !editable || blockingDiagnostics.length > 0}
            onClick={() =>
              runAction("layout.save_draft", () => {
                const reference = projectActions.saveLayoutDraft(selectedLayoutRef, draft);
                setDraft({ ...draft, revision: reference.revision });
              })
            }
          >
            <Save data-icon="inline-start" aria-hidden="true" />
            Save
          </Button>
          {advancedMode && (
            <>
              <Button
                size="xs"
                variant="outline"
                disabled={!editable || blockingDiagnostics.length > 0}
                onClick={() => setSaveAsState(saveAsState === "open" ? "closed" : "open")}
              >
                Save As…
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  runAction("layout.duplicate", () => {
                    projectActions.duplicateLayout(selectedLayoutRef);
                  })
                }
              >
                <Copy data-icon="inline-start" aria-hidden="true" />
                Duplicate
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={!draft.name.trim() || draft.name === selectedLayout.name || !editable}
                onClick={() =>
                  runAction("layout.rename", () => {
                    projectActions.renameLayout(selectedLayoutRef, draft.name);
                  })
                }
              >
                <PencilLine data-icon="inline-start" aria-hidden="true" />
                Rename
              </Button>
              <Button
                size="xs"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={usedOnStage}
                title={usedOnStage ? "The current Stage pins this Layout revision." : undefined}
                onClick={() =>
                  runAction("layout.delete", () => projectActions.deleteLayout(selectedLayoutRef))
                }
              >
                <Trash2 data-icon="inline-start" aria-hidden="true" />
                Delete
              </Button>
            </>
          )}
          <Button
            size="xs"
            disabled={dirty || blockingDiagnostics.length > 0}
            onClick={() => {
              if (usedOnStage) {
                projectActions.setSelectedTargetSetId("all");
                workspaceActions.setActiveWorkspace("effect-lab");
              } else setImpactOpen(true);
            }}
          >
            <Sparkles data-icon="inline-start" aria-hidden="true" />
            {usedOnStage ? "Preview Effects" : "Use on Stage"}
          </Button>
        </div>
        <div className="text-muted-foreground flex items-center gap-1.5 text-[9px]">
          <Eye className="text-primary size-3" aria-hidden="true" />
          <span>
            {previewing ? "Compiling Canvas preview…" : "Canvas follows this isolated Draft"}
          </span>
        </div>
        <Button
          size="xs"
          variant="ghost"
          className="justify-start"
          onClick={() => setPatchOpen(true)}
        >
          <Cable data-icon="inline-start" aria-hidden="true" />
          Stage patch: {fixtureIds.length} fixtures · Configure
        </Button>
        {layoutCapacity(draft) > fixtureIds.length && (
          <FieldDescription>
            {layoutCapacity(draft) - fixtureIds.length} unpatched positions use dashed Canvas
            borders.
          </FieldDescription>
        )}
        {saveAsState === "open" && (
          <div className="border-border bg-background/40 flex flex-col gap-2 rounded-md border p-2">
            <Field>
              <FieldLabel htmlFor="layout-save-as-name">New Layout name</FieldLabel>
              <Input
                id="layout-save-as-name"
                autoFocus
                value={saveAsName}
                onChange={(event) => setSaveAsName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSaveAsState("closed");
                }}
              />
            </Field>
            <div className="flex justify-end gap-1.5">
              <Button size="xs" variant="ghost" onClick={() => setSaveAsState("closed")}>
                Cancel
              </Button>
              <Button
                size="xs"
                disabled={!saveAsName.trim()}
                onClick={() =>
                  runAction("layout.save_as", () => {
                    projectActions.saveLayoutAs(draft, saveAsName);
                    setSaveAsState("closed");
                  })
                }
              >
                Save new Layout
              </Button>
            </div>
          </div>
        )}
      </section>
      {actionDiagnostic && (
        <div className="border-border shrink-0 border-b p-2">
          <LayoutDiagnosticAlert
            severity="error"
            code={actionDiagnostic.code}
            path={actionDiagnostic.path}
            message={actionDiagnostic.message}
            recovery={actionDiagnostic.hint ?? "Review the references and retry the action."}
          />
        </div>
      )}
      {impactOpen ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-3">
            <StageLayoutImpactPanel
              impact={analyzeStageTopology(bundle, selectedLayoutRef)}
              advanced={advancedMode}
              onClose={() => setImpactOpen(false)}
              onApply={(request) =>
                runAction("stage.layout_upgrade", () => {
                  projectActions.useLayoutOnStage(request);
                  setImpactOpen(false);
                  workspaceActions.setActiveWorkspace("effect-lab");
                })
              }
            />
          </div>
        </ScrollArea>
      ) : view === "groups" ? (
        <div className="min-h-0 flex-1">
          <StageCollectionEditorLauncher
            kind="groups"
            onOpen={() => {
              setCollectionEditorKind("groups");
              setCollectionEditorOpen(true);
            }}
          />
        </div>
      ) : view === "targets" ? (
        <div className="min-h-0 flex-1">
          <StageCollectionEditorLauncher
            kind="targets"
            onOpen={() => {
              setCollectionEditorKind("targets");
              setCollectionEditorOpen(true);
            }}
          />
        </div>
      ) : view === "scenes" ? (
        <ScrollArea className="min-h-0 flex-1">
          <TargetingSceneEditor />
        </ScrollArea>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-3">
            <Field>
              <FieldLabel htmlFor="layout-draft-name">Library name</FieldLabel>
              <Input
                id="layout-draft-name"
                value={draft.name}
                disabled={!editable}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
              <FieldDescription>
                Changes stay in Draft until you use this layout on Stage.
              </FieldDescription>
            </Field>

            <LayoutGeometryEditor
              layout={draft}
              stage={stage}
              advanced={advancedMode}
              onChange={setDraft}
            />

            {localDiagnostics.map((diagnostic) => (
              <LayoutDiagnosticAlert
                key={`${diagnostic.code}:${diagnostic.path}`}
                severity={diagnostic.severity}
                code={diagnostic.code}
                path={diagnostic.path}
                message={diagnostic.message}
                recovery={diagnostic.recovery}
              />
            ))}
            {capacityDiagnostic && (
              <LayoutDiagnosticAlert
                severity={capacityDiagnostic.severity}
                code={capacityDiagnostic.code}
                path={capacityDiagnostic.path}
                message={capacityDiagnostic.message}
                recovery={capacityDiagnostic.recovery}
              />
            )}
            {previewDiagnostics.map((diagnostic) => (
              <LayoutDiagnosticAlert
                key={`${diagnostic.code}:${diagnostic.path}`}
                severity="error"
                code={diagnostic.code}
                path={diagnostic.path}
                message={diagnostic.message}
                recovery={diagnostic.hint ?? "Repair the Draft parameters and retry preview."}
              />
            ))}
          </div>
        </ScrollArea>
      )}
      <StagePatchDialog
        draftCapacity={layoutCapacity(draft)}
        advanced={advancedMode}
        open={patchOpen}
        onOpenChange={setPatchOpen}
      />
      <StageCollectionEditorDialog
        kind={collectionEditorKind}
        open={collectionEditorOpen}
        onOpenChange={setCollectionEditorOpen}
      />
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background/50 min-w-0 px-2 py-1.5">
      <p className="text-muted-foreground text-[8px] tracking-wide uppercase">{label}</p>
      <p className="truncate font-mono text-[10px] capitalize">{value.replace(/_/g, " ")}</p>
    </div>
  );
}

function LayoutDiagnosticAlert({
  severity,
  code,
  path,
  message,
  recovery,
}: {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
  recovery: string;
}) {
  return (
    <Alert variant={severity === "error" ? "destructive" : "default"}>
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>
        {code} · {path}
      </AlertTitle>
      <AlertDescription>
        {message} {recovery}
      </AlertDescription>
    </Alert>
  );
}

function normalizeDiagnostics(error: unknown, path: string): Diagnostic[] {
  if (Array.isArray(error)) {
    return error.map((item, index) => ({
      code: typeof item?.code === "string" ? item.code : "LAYOUT_PREVIEW_FAILED",
      severity: item?.severity === "warning" ? "warning" : "error",
      path: typeof item?.path === "string" ? item.path : `${path}[${index}]`,
      message: typeof item?.message === "string" ? item.message : String(item),
      hint: typeof item?.hint === "string" ? item.hint : null,
    }));
  }
  return [
    {
      code: "LAYOUT_ACTION_FAILED",
      severity: "error",
      path,
      message: error instanceof Error ? error.message : String(error),
      hint: "Review the layout and Stage settings, then try again.",
    },
  ];
}
