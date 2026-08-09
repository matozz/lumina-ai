import { useEffect } from "react";
import { authoringTransportActions, useAuthoringTransportStore } from "@/authoring/transport";
import { isTextEditingTarget } from "@/lib/dom";

interface ArrangementEditorShortcutOptions {
  hasSelection: boolean;
  onClearSelection: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEscape: () => void;
  onFit: () => void;
  onJumpToLastCue: () => void;
  onJumpToStart: () => void;
  onMoveSelection: (deltaTick: number) => void;
  onPaste: () => void;
  onRedo: () => void;
  onResizeSelection: (deltaTick: number) => void;
  onSelectAll: () => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  sessionKey: string;
  snapTicks: number;
  ppq: number;
}

export function useArrangementEditorShortcuts({
  hasSelection,
  onClearSelection,
  onCopy,
  onDelete,
  onDuplicate,
  onEscape,
  onFit,
  onJumpToLastCue,
  onJumpToStart,
  onMoveSelection,
  onPaste,
  onRedo,
  onResizeSelection,
  onSelectAll,
  onUndo,
  onZoomIn,
  onZoomOut,
  sessionKey,
  snapTicks,
  ppq,
}: ArrangementEditorShortcutOptions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || shortcutEventIsBlocked(event)) return;
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (!command && event.key === "Escape") {
        event.preventDefault();
        onEscape();
        return;
      }

      if (!command && (event.code === "Space" || event.key === " ")) {
        event.preventDefault();
        const session = useAuthoringTransportStore.getState().sessions[sessionKey];
        if (!session) return;
        if (session.playback === "playing") authoringTransportActions.pause(sessionKey);
        else authoringTransportActions.play(sessionKey);
        return;
      }
      if (!command) {
        if (hasSelection && (event.key === "Delete" || event.key === "Backspace")) {
          event.preventDefault();
          onDelete();
        } else if (hasSelection && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
          event.preventDefault();
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          const deltaTick = direction * (event.shiftKey ? ppq : snapTicks);
          if (event.altKey) onResizeSelection(deltaTick);
          else onMoveSelection(deltaTick);
        }
        return;
      }

      if (key === "a") {
        event.preventDefault();
        if (event.shiftKey) onClearSelection();
        else onSelectAll();
      } else if (key === "c" && hasSelection) {
        event.preventDefault();
        onCopy();
      } else if (key === "v") {
        event.preventDefault();
        onPaste();
      } else if (key === "d" && hasSelection) {
        event.preventDefault();
        onDuplicate();
      } else if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) onRedo();
        else onUndo();
      } else if (key === "y") {
        event.preventDefault();
        onRedo();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        onZoomIn();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        onZoomOut();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onJumpToStart();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onJumpToLastCue();
      } else if (event.key === "0") {
        event.preventDefault();
        onFit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    hasSelection,
    onClearSelection,
    onCopy,
    onDelete,
    onDuplicate,
    onEscape,
    onFit,
    onJumpToLastCue,
    onJumpToStart,
    onMoveSelection,
    onPaste,
    onRedo,
    onResizeSelection,
    onSelectAll,
    onUndo,
    onZoomIn,
    onZoomOut,
    ppq,
    sessionKey,
    snapTicks,
  ]);
}

export function shortcutEventIsBlocked(event: KeyboardEvent) {
  return event.composedPath().some(shortcutTargetIsBlocked);
}

export function shortcutTargetIsBlocked(target: EventTarget | null) {
  if (isTextEditingTarget(target)) return true;
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      '[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"], [aria-haspopup="dialog"]',
    ) !== null ||
    target.closest(
      '[role="dialog"], [role="menu"], [data-slot="popover-content"], [data-slot="select-content"]',
    ) !== null
  );
}
