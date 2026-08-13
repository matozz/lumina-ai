import {
  AlertTriangle,
  Download,
  FolderOpen,
  ListPlus,
  Package,
  PackageOpen,
  RefreshCcw,
  RotateCw,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UserAssetPack } from "@/bridge/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  assetPackConflicts,
  validateUserAssetPack,
  type AssetPackConflict,
} from "@/document/userAssetPack";
import { downloadUserAssetPack, readUserAssetPackFile } from "@/document/userAssetPackFile";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import {
  projectStorageActions,
  projectStorageSelectors,
  useProjectStorageStore,
} from "@/stores/projectStorage";
import { workspaceActions } from "@/stores/workspace";

export function WorkspaceAssetPackMenu({ disabled = false }: { disabled?: boolean }) {
  const bundle = useProjectStore(projectSelectors.bundle);
  const projectDirectory = useProjectStorageStore(projectStorageSelectors.directory);
  const historyCount = useProjectStorageStore(projectStorageSelectors.historyCount);
  const isSaving = useProjectStorageStore(projectStorageSelectors.isSaving);
  const storageError = useProjectStorageStore(projectStorageSelectors.error);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [projectName, setProjectName] = useState(bundle.manifest.name);
  const [pendingPack, setPendingPack] = useState<UserAssetPack | null>(null);
  const [conflicts, setConflicts] = useState<AssetPackConflict[]>([]);

  useEffect(() => setProjectName(bundle.manifest.name), [bundle.manifest.name]);

  const commitProjectName = () => {
    const nextName = projectName.trim();
    if (!nextName) {
      setProjectName(bundle.manifest.name);
      showError(new Error("Project name cannot be empty."));
      return;
    }
    if (nextName === bundle.manifest.name) return;
    try {
      projectActions.renameProject(nextName);
      setProjectName(nextName);
      setMessage("Project name updated.");
      workspaceActions.setPublishStatus("idle", "Project name updated.");
    } catch (error) {
      setProjectName(bundle.manifest.name);
      showError(error);
    }
  };

  const exportPack = () => {
    try {
      const pack = projectActions.exportAssetPack();
      downloadUserAssetPack(pack);
      setMessage("Asset pack downloaded.");
      workspaceActions.setPublishStatus("idle", "Asset pack downloaded.");
    } catch (error) {
      showError(error);
    }
  };

  const exportBasePack = () => {
    try {
      const pack = projectActions.exportBaseAssetPack();
      downloadUserAssetPack(pack);
      setMessage("Base asset pack downloaded.");
      workspaceActions.setPublishStatus("idle", "Base asset pack downloaded.");
    } catch (error) {
      showError(error);
    }
  };

  const chooseImport = () => {
    setMessage(null);
    inputRef.current?.click();
  };

  const chooseProjectFolder = () => {
    setOpen(false);
    void projectStorageActions.chooseDirectory();
  };

  const readImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const value = await readUserAssetPackFile(file);
      const validation = validateUserAssetPack(value);
      if (!validation.success) {
        throw new Error(
          `This asset pack is invalid: ${validation.issues
            .slice(0, 3)
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join(" · ")}`,
        );
      }
      const nextConflicts = assetPackConflicts(bundle, validation.data);
      setPendingPack(validation.data);
      setConflicts(nextConflicts);
      setOpen(false);
    } catch (error) {
      showError(error);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const importPack = (pack: UserAssetPack, mode: "incremental" | "replace") => {
    try {
      const result =
        mode === "replace"
          ? projectActions.replaceAssetPack(pack)
          : projectActions.importAssetPack(pack, "rename");
      const count =
        result.importedPack.stages.length +
        result.importedPack.layouts.length +
        result.importedPack.effects.length +
        result.importedPack.cues.length +
        result.importedPack.arrangements.length;
      const success =
        mode === "replace"
          ? `Project assets replaced with ${count} incoming assets.`
          : `${count} assets imported incrementally.`;
      setMessage(success);
      dismissImport();
      setOpen(false);
      workspaceActions.setPublishStatus("idle", success);
    } catch (error) {
      showError(error);
    }
  };

  const dismissImport = () => {
    setPendingPack(null);
    setConflicts([]);
  };

  const showError = (error: unknown) => {
    const nextMessage = error instanceof Error ? error.message : "Asset pack operation failed.";
    setMessage(nextMessage);
    workspaceActions.setPublishStatus("error", nextMessage);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" disabled={disabled}>
              <PackageOpen data-icon="inline-start" aria-hidden="true" />
              Assets
            </Button>
          }
        />
        <PopoverContent align="end" className="w-72">
          <PopoverHeader>
            <PopoverTitle>Project assets</PopoverTitle>
            <PopoverDescription>
              Choose durable project storage or move authoring assets between projects.
            </PopoverDescription>
          </PopoverHeader>
          <Field className="border-border border-b pb-3">
            <FieldLabel htmlFor="project-name">Project name</FieldLabel>
            <Input
              id="project-name"
              value={projectName}
              onChange={(event) => setProjectName(event.currentTarget.value)}
              onBlur={commitProjectName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  event.preventDefault();
                  setProjectName(bundle.manifest.name);
                }
              }}
            />
          </Field>
          <div className="border-border grid gap-1.5 border-b pb-3">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              Project folder
            </p>
            <p className="truncate text-xs" title={projectDirectory ?? undefined}>
              {projectDirectory ? compactPath(projectDirectory) : "Not selected"}
            </p>
            <p className="text-muted-foreground text-[11px]">
              {isSaving
                ? "Saving…"
                : `${historyCount} of 50 recent ${historyCount === 1 ? "version" : "versions"}`}
            </p>
            {storageError && (
              <div className="grid gap-1.5">
                <p
                  className="text-destructive truncate text-[11px]"
                  role="alert"
                  title={storageError}
                >
                  Last save failed. Editing is still available.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-start"
                  onClick={() => void projectStorageActions.retrySave()}
                >
                  <RotateCw data-icon="inline-start" aria-hidden="true" />
                  Retry save
                </Button>
              </div>
            )}
            <Button variant="outline" className="justify-start" onClick={chooseProjectFolder}>
              <FolderOpen data-icon="inline-start" aria-hidden="true" />
              Change project folder
            </Button>
          </div>
          <div className="grid gap-1.5">
            <Button variant="outline" className="justify-start" onClick={exportPack}>
              <Download data-icon="inline-start" aria-hidden="true" />
              Export asset pack
            </Button>
            <Button variant="outline" className="justify-start" onClick={chooseImport}>
              <Upload data-icon="inline-start" aria-hidden="true" />
              Import asset pack
            </Button>
          </div>
          {message && (
            <p className="text-muted-foreground text-xs" role="status">
              {message}
            </p>
          )}
          <Separator />
          <Button
            variant="outline"
            className="justify-start"
            title="Export the source-controlled built-in assets for Skills and reuse"
            onClick={exportBasePack}
          >
            <Package data-icon="inline-start" aria-hidden="true" />
            Export base asset pack
          </Button>
        </PopoverContent>
      </Popover>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Choose Lumina asset pack"
        onChange={(event) => void readImport(event.currentTarget.files?.[0])}
      />

      <Dialog open={pendingPack !== null} onOpenChange={(nextOpen) => !nextOpen && dismissImport()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Choose asset import mode</DialogTitle>
            <DialogDescription>
              {conflicts.length > 0
                ? `${conflicts.length} incoming ${conflicts.length === 1 ? "asset overlaps" : "assets overlap"} content already in this project.`
                : "This pack has no asset identity conflicts with the current project."}
            </DialogDescription>
          </DialogHeader>
          {conflicts.length > 0 && (
            <ul className="text-muted-foreground grid max-h-32 gap-1 overflow-auto rounded-md border p-2 text-xs">
              {conflicts.map((conflict) => (
                <li key={`${conflict.kind}:${conflict.id}`}>
                  <span className="text-foreground font-medium">{conflict.name}</span>
                  {` · ${friendlyKind(conflict.kind)} · ${conflict.id}`}
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2">
            <Button
              variant="outline"
              className="h-auto justify-start px-3 py-3 text-left whitespace-normal"
              onClick={() => pendingPack && importPack(pendingPack, "incremental")}
              disabled={!pendingPack}
            >
              <ListPlus className="mt-0.5 self-start" aria-hidden="true" />
              <span className="grid gap-0.5">
                <span>Incremental import</span>
                <span className="text-muted-foreground text-xs font-normal">
                  Keep current assets. Conflicts become independent copies with their links intact.
                </span>
              </span>
            </Button>
            <Button
              variant="destructive"
              className="h-auto justify-start px-3 py-3 text-left whitespace-normal"
              onClick={() => pendingPack && importPack(pendingPack, "replace")}
              disabled={!pendingPack}
            >
              <RefreshCcw className="mt-0.5 self-start" aria-hidden="true" />
              <span className="grid gap-0.5">
                <span>Replace all assets</span>
                <span className="text-xs font-normal">
                  Discard every current asset and reset to this pack. Project name and folder stay.
                </span>
              </span>
            </Button>
            <p className="text-destructive flex items-start gap-1.5 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Replace cannot be undone. The current Live version stays active until you publish
              again.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={dismissImport}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function compactPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return `…/${parts.slice(-3).join("/")}`;
}

function friendlyKind(kind: AssetPackConflict["kind"]) {
  if (kind === "stage") return "Stage";
  if (kind === "layout") return "Layout";
  if (kind === "effect") return "Effect";
  if (kind === "cue") return "Cue";
  return "Arrangement";
}
