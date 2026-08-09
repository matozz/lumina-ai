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
        claimShortcut(event);
        onEscape();
        return;
      }

      if (!command && (event.code === "Space" || event.key === " ")) {
        claimShortcut(event);
        const session = useAuthoringTransportStore.getState().sessions[sessionKey];
        if (!session) return;
        if (session.playback === "playing") authoringTransportActions.pause(sessionKey);
        else authoringTransportActions.play(sessionKey);
        return;
      }
      if (!command) {
        if (hasSelection && (event.key === "Delete" || event.key === "Backspace")) {
          claimShortcut(event);
          onDelete();
        } else if (hasSelection && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
          claimShortcut(event);
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          const deltaTick = direction * (event.shiftKey ? ppq : snapTicks);
          if (event.altKey) onResizeSelection(deltaTick);
          else onMoveSelection(deltaTick);
        }
        return;
      }

      if (key === "a") {
        claimShortcut(event);
        if (event.shiftKey) onClearSelection();
        else onSelectAll();
      } else if (key === "c" && hasSelection) {
        claimShortcut(event);
        onCopy();
      } else if (key === "v") {
        claimShortcut(event);
        onPaste();
      } else if (key === "d" && hasSelection) {
        claimShortcut(event);
        onDuplicate();
      } else if (key === "z") {
        claimShortcut(event);
        if (event.shiftKey) onRedo();
        else onUndo();
      } else if (key === "y") {
        claimShortcut(event);
        onRedo();
      } else if (event.key === "ArrowUp") {
        claimShortcut(event);
        onZoomIn();
      } else if (event.key === "ArrowDown") {
        claimShortcut(event);
        onZoomOut();
      } else if (event.key === "ArrowLeft") {
        claimShortcut(event);
        onJumpToStart();
      } else if (event.key === "ArrowRight") {
        claimShortcut(event);
        onJumpToLastCue();
      } else if (event.key === "0") {
        claimShortcut(event);
        onFit();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
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
  return (
    event.composedPath().some(shortcutTargetIsBlocked) ||
    arrangementShortcutOverlayIsOpen(eventDocument(event))
  );
}

export function shortcutTargetIsBlocked(target: EventTarget | null) {
  if (isTextEditingTarget(target)) return true;
  if (!(target instanceof Element)) return false;
  return target.closest(ARRANGEMENT_OVERLAY_CONTENT_SELECTOR) !== null;
}

export function arrangementShortcutOverlayIsOpen(document: Document) {
  return document.querySelector(ARRANGEMENT_OPEN_OVERLAY_SELECTOR) !== null;
}

function claimShortcut(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function eventDocument(event: KeyboardEvent) {
  const target = event.composedPath()[0];
  return target instanceof Node ? (target.ownerDocument ?? document) : document;
}

const ARRANGEMENT_OVERLAY_CONTENT_SELECTOR = [
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[data-slot="dialog-content"]',
  '[data-slot="popover-content"]',
  '[data-slot="select-content"]',
  '[data-slot="context-menu-content"]',
  '[data-slot="context-menu-sub-content"]',
].join(", ");

const ARRANGEMENT_OPEN_OVERLAY_SELECTOR = [
  '[data-slot="dialog-content"][data-open]',
  '[data-slot="popover-content"][data-open]',
  '[data-slot="select-content"][data-open]',
  '[data-slot="context-menu-content"][data-open]',
  '[data-slot="context-menu-sub-content"][data-open]',
].join(", ");
