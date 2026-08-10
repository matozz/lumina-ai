import { Download, FolderOpen, PackageOpen, RotateCw, Upload } from "lucide-react";
import { useRef, useState } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  const [pendingPack, setPendingPack] = useState<UserAssetPack | null>(null);
  const [conflicts, setConflicts] = useState<AssetPackConflict[]>([]);

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
        throw new Error("This is not a complete Lumina V1 asset pack.");
      }
      const nextConflicts = assetPackConflicts(bundle, validation.data);
      if (nextConflicts.length > 0) {
        setPendingPack(validation.data);
        setConflicts(nextConflicts);
        setOpen(false);
        return;
      }
      importPack(validation.data, "reject");
    } catch (error) {
      showError(error);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const importPack = (pack: UserAssetPack, strategy: "reject" | "rename") => {
    try {
      const result = projectActions.importAssetPack(pack, strategy);
      const count =
        result.importedPack.layouts.length +
        result.importedPack.effects.length +
        result.importedPack.cues.length +
        result.importedPack.arrangements.length;
      const success = `${count} assets imported${strategy === "rename" ? " as independent copies" : ""}.`;
      setMessage(success);
      setPendingPack(null);
      setConflicts([]);
      setOpen(false);
      workspaceActions.setPublishStatus("idle", success);
    } catch (error) {
      showError(error);
    }
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

      <Dialog
        open={pendingPack !== null}
        onOpenChange={(nextOpen) => !nextOpen && setPendingPack(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import assets as independent copies?</DialogTitle>
            <DialogDescription>
              {conflicts.length} incoming{" "}
              {conflicts.length === 1 ? "asset overlaps" : "assets overlap"}
              content already in this project. Lumina can import independent copies and keep their
              links intact.
            </DialogDescription>
          </DialogHeader>
          <ul className="text-muted-foreground grid max-h-40 gap-1 overflow-auto text-sm">
            {conflicts.map((conflict) => (
              <li key={`${conflict.kind}:${conflict.id}`}>
                {friendlyKind(conflict.kind)} conflict
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingPack(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => pendingPack && importPack(pendingPack, "rename")}
              disabled={!pendingPack}
            >
              Import as copies
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
