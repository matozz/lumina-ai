import { useCallback, useRef, useState } from "react";
import type { ArrangementDocument, AssetRef, ProjectBundle } from "@/bridge/types";
import { authoringDiagnostic, type AuthoringDiagnostic } from "@/authoring/diagnostics";
import { projectActions } from "@/stores/project";
import {
  deleteArrangementSelection,
  moveArrangementSelection,
  resizeArrangementSelection,
} from "./arrangementBulkCommands";
import {
  copyArrangementSelection,
  duplicateArrangementSelection,
  pasteArrangementSelection,
  type ArrangementClipboardPayload,
} from "./arrangementClipboard";
import {
  allArrangementItems,
  arrangementSelectionFromItems,
  type ArrangementSelectionItem,
} from "./arrangementSelection";
import { useArrangementSelection } from "./useArrangementSelection";

interface ArrangementTimelineEditingOptions {
  anchorTick: () => number;
  arrangement: ArrangementDocument | undefined;
  reference: AssetRef;
  snapTicks: number;
}

export function useArrangementTimelineEditing({
  anchorTick,
  arrangement,
  reference,
  snapTicks,
}: ArrangementTimelineEditingOptions) {
  const [diagnostic, setDiagnostic] = useState<AuthoringDiagnostic | null>(null);
  const clipboardRef = useRef<ArrangementClipboardPayload | null>(null);
  const gestureCancelRef = useRef<(() => void) | null>(null);
  const { clearSelection, selectItem, selection, setSelection } =
    useArrangementSelection(arrangement);

  const runCommand = useCallback(
    (
      label: string,
      path: string,
      update: (draft: ArrangementDocument, bundle: ProjectBundle) => void,
    ) => {
      try {
        projectActions.updateArrangement(reference, label, update);
        setDiagnostic(null);
        return true;
      } catch (error) {
        setDiagnostic(authoringDiagnostic(error, path));
        return false;
      }
    },
    [reference],
  );

  const moveItems = useCallback(
    (items: ArrangementSelectionItem[], deltaTick: number) => {
      if (!arrangement || items.length === 0 || deltaTick === 0) return;
      const commandSelection = arrangementSelectionFromItems(items);
      runCommand("Move timeline selection", "arrangement.selection.move", (draft) =>
        moveArrangementSelection(draft, commandSelection, deltaTick),
      );
    },
    [arrangement, runCommand],
  );

  const resizeItems = useCallback(
    (items: ArrangementSelectionItem[], deltaTick: number) => {
      if (!arrangement || items.length === 0 || deltaTick === 0) return;
      const commandSelection = arrangementSelectionFromItems(items);
      runCommand("Resize CueClip selection", "arrangement.selection.resize", (draft) =>
        resizeArrangementSelection(draft, commandSelection, deltaTick),
      );
    },
    [arrangement, runCommand],
  );

  const deleteItems = useCallback(
    (items: ArrangementSelectionItem[]) => {
      if (!arrangement || items.length === 0) return;
      const commandSelection = arrangementSelectionFromItems(items);
      if (
        runCommand("Delete timeline selection", "arrangement.selection.delete", (draft) =>
          deleteArrangementSelection(draft, commandSelection),
        )
      ) {
        clearSelection();
      }
    },
    [arrangement, clearSelection, runCommand],
  );

  const duplicateItems = useCallback(
    (items: ArrangementSelectionItem[]) => {
      if (!arrangement || items.length === 0) return;
      let nextSelection = arrangementSelectionFromItems([]);
      if (
        runCommand("Duplicate timeline selection", "arrangement.selection.duplicate", (draft) => {
          nextSelection = duplicateArrangementSelection(
            draft,
            arrangementSelectionFromItems(items),
            snapTicks,
          );
        })
      ) {
        setSelection(nextSelection);
      }
    },
    [arrangement, runCommand, setSelection, snapTicks],
  );

  const copySelection = useCallback(() => {
    if (!arrangement || selection.items.length === 0) return;
    try {
      clipboardRef.current = copyArrangementSelection(arrangement, selection);
      setDiagnostic(null);
    } catch (error) {
      setDiagnostic(authoringDiagnostic(error, "arrangement.selection.copy"));
    }
  }, [arrangement, selection]);

  const pasteSelection = useCallback(() => {
    const payload = clipboardRef.current;
    if (!arrangement || !payload) return;
    let nextSelection = arrangementSelectionFromItems([]);
    if (
      runCommand("Paste timeline selection", "arrangement.selection.paste", (draft) => {
        nextSelection = pasteArrangementSelection(draft, payload, anchorTick());
      })
    ) {
      setSelection(nextSelection);
    }
  }, [anchorTick, arrangement, runCommand, setSelection]);

  const selectAll = useCallback(() => {
    if (arrangement) setSelection(arrangementSelectionFromItems(allArrangementItems(arrangement)));
  }, [arrangement, setSelection]);

  const cancelGestureOrClearSelection = useCallback(() => {
    if (gestureCancelRef.current) gestureCancelRef.current();
    else clearSelection();
  }, [clearSelection]);

  const setGestureCancel = useCallback((cancel: (() => void) | null) => {
    gestureCancelRef.current = cancel;
  }, []);

  return {
    cancelGestureOrClearSelection,
    clearSelection,
    copySelection,
    deleteItems,
    diagnostic,
    duplicateItems,
    moveItems,
    pasteSelection,
    resizeItems,
    runCommand,
    selectAll,
    selectItem,
    selection,
    setDiagnostic,
    setGestureCancel,
    setSelection,
  };
}
