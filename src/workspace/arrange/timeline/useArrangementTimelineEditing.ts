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
import {
  ensureAutomationAtTick,
  findAutomationLaneByTarget,
  type ArrangementAutomationOption,
} from "./arrangementTimelineModel";
import { useArrangementSelection } from "./useArrangementSelection";

interface ArrangementTimelineEditingOptions {
  anchorTick: () => number;
  arrangement: ArrangementDocument | undefined;
  bundle: ProjectBundle;
  reference: AssetRef;
  snapTicks: number;
}

export function useArrangementTimelineEditing({
  anchorTick,
  arrangement,
  bundle,
  reference,
  snapTicks,
}: ArrangementTimelineEditingOptions) {
  const [diagnostic, setDiagnostic] = useState<AuthoringDiagnostic | null>(null);
  const [clipboardKind, setClipboardKind] = useState<"clips" | "keyframes" | "mixed" | null>(null);
  const [revealRequest, setRevealRequest] = useState<{
    keyframeId: string;
    laneId: string;
    nonce: number;
  } | null>(null);
  const revealNonceRef = useRef(0);
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

  const copySelection = useCallback(
    (items: ArrangementSelectionItem[] = selection.items) => {
      if (!arrangement || items.length === 0) return;
      try {
        const payload = copyArrangementSelection(arrangement, arrangementSelectionFromItems(items));
        clipboardRef.current = payload;
        setClipboardKind(
          payload.clips.length > 0 && payload.keyframes.length > 0
            ? "mixed"
            : payload.clips.length > 0
              ? "clips"
              : "keyframes",
        );
        setDiagnostic(null);
      } catch (error) {
        setDiagnostic(authoringDiagnostic(error, "arrangement.selection.copy"));
      }
    },
    [arrangement, selection.items],
  );

  const pasteSelection = useCallback(
    (requestedAnchorTick?: number) => {
      const payload = clipboardRef.current;
      if (!arrangement || !payload) return;
      let nextSelection = arrangementSelectionFromItems([]);
      if (
        runCommand("Paste timeline selection", "arrangement.selection.paste", (draft) => {
          nextSelection = pasteArrangementSelection(
            draft,
            payload,
            requestedAnchorTick ?? anchorTick(),
          );
        })
      ) {
        setSelection(nextSelection);
      }
    },
    [anchorTick, arrangement, runCommand, setSelection],
  );

  const ensureAutomation = useCallback(
    (trackId: string, option: ArrangementAutomationOption, timeTick: number) => {
      if (!arrangement) return;
      const maximumGridTick = Math.floor((arrangement.length_ticks - 1) / snapTicks) * snapTicks;
      const tick = Math.max(
        0,
        Math.min(maximumGridTick, Math.round(timeTick / snapTicks) * snapTicks),
      );
      const current = findAutomationLaneByTarget(arrangement, option.target);
      const currentKeyframe = current?.lane.keyframes.find(
        (keyframe) => keyframe.time_tick === tick,
      );
      if (current && currentKeyframe) {
        setDiagnostic(null);
        setSelection(
          arrangementSelectionFromItems([
            {
              type: "keyframe",
              trackId: current.track.id,
              laneId: current.lane.id,
              keyframeId: currentKeyframe.id,
            },
          ]),
        );
        setRevealRequest({
          laneId: current.lane.id,
          keyframeId: currentKeyframe.id,
          nonce: ++revealNonceRef.current,
        });
        return;
      }
      let target: ReturnType<typeof ensureAutomationAtTick> | null = null;
      if (
        runCommand(
          "Create or reveal typed automation",
          "arrangement.automation.context",
          (draft) => {
            target = ensureAutomationAtTick(bundle, draft, trackId, option, tick);
          },
        ) &&
        target
      ) {
        const resolved = target as ReturnType<typeof ensureAutomationAtTick>;
        setSelection(
          arrangementSelectionFromItems([
            {
              type: "keyframe",
              trackId: resolved.trackId,
              laneId: resolved.laneId,
              keyframeId: resolved.keyframeId,
            },
          ]),
        );
        setRevealRequest({
          laneId: resolved.laneId,
          keyframeId: resolved.keyframeId,
          nonce: ++revealNonceRef.current,
        });
      }
    },
    [arrangement, bundle, runCommand, setSelection, snapTicks],
  );

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
    clipboardKind,
    copySelection,
    deleteItems,
    diagnostic,
    duplicateItems,
    ensureAutomation,
    moveItems,
    pasteSelection,
    resizeItems,
    revealRequest,
    runCommand,
    selectAll,
    selectItem,
    selection,
    setDiagnostic,
    setGestureCancel,
    setSelection,
  };
}
