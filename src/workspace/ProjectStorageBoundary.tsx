import { FolderOpen, LoaderCircle, RotateCw } from "lucide-react";
import { type ReactNode, useEffect } from "react";
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
  createProjectAutosaveController,
  projectStorageActions,
  projectStorageSelectors,
  useProjectStorageStore,
} from "@/stores/projectStorage";

export function ProjectStorageBoundary({ children }: { children: ReactNode }) {
  const phase = useProjectStorageStore(projectStorageSelectors.phase);
  const error = useProjectStorageStore(projectStorageSelectors.error);
  const isLoading = phase === "booting" || phase === "loading";

  useEffect(() => {
    void projectStorageActions.initialize();
    const autosave = createProjectAutosaveController();
    return () => autosave.dispose();
  }, []);

  return (
    <>
      {children}
      <Dialog open={phase !== "ready"} onOpenChange={() => undefined}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Choose a project folder</DialogTitle>
            <DialogDescription>
              Lumina keeps the current project as <code>lumina-project.json</code> in this folder
              and retains up to 50 recent versions. An existing project in the folder opens
              automatically.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            The folder choice is remembered on this device. Lumina will not start authoring until
            the folder is available.
          </p>
          <DialogFooter>
            {phase === "error" && (
              <Button variant="outline" onClick={() => void projectStorageActions.retrySave()}>
                <RotateCw data-icon="inline-start" aria-hidden="true" />
                Retry
              </Button>
            )}
            <Button
              disabled={isLoading}
              onClick={() => void projectStorageActions.chooseDirectory()}
            >
              {isLoading ? (
                <LoaderCircle
                  className="animate-spin"
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              ) : (
                <FolderOpen data-icon="inline-start" aria-hidden="true" />
              )}
              {isLoading
                ? "Opening…"
                : phase === "error"
                  ? "Choose another folder"
                  : "Choose folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
