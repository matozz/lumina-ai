import { useEffect } from "react";
import { authoringTransportActions, useAuthoringTransportStore } from "@/authoring/transport";
import { isTextEditingTarget } from "@/lib/dom";

interface ArrangementEditorShortcutOptions {
  onFit: () => void;
  onRedo: () => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  sessionKey: string;
}

export function useArrangementEditorShortcuts({
  onFit,
  onRedo,
  onUndo,
  onZoomIn,
  onZoomOut,
  sessionKey,
}: ArrangementEditorShortcutOptions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || shortcutTargetIsBlocked(event.target)) return;
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (!command && (event.code === "Space" || event.key === " ")) {
        event.preventDefault();
        const session = useAuthoringTransportStore.getState().sessions[sessionKey];
        if (!session) return;
        if (session.playback === "playing") authoringTransportActions.pause(sessionKey);
        else authoringTransportActions.play(sessionKey);
        return;
      }
      if (!command) return;

      if (key === "z") {
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
      } else if (event.key === "0") {
        event.preventDefault();
        onFit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onFit, onRedo, onUndo, onZoomIn, onZoomOut, sessionKey]);
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
