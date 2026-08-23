import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function usePreviewFullscreen(targetRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const previewFullscreenRef = useRef(false);
  const ownsNativeFullscreenRef = useRef(false);

  const updatePreviewFullscreen = useCallback((next: boolean) => {
    previewFullscreenRef.current = next;
    setPreviewFullscreen(next);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!isTauri()) {
      const syncBrowserFullscreen = () => {
        updatePreviewFullscreen(document.fullscreenElement === targetRef.current);
      };
      document.addEventListener("fullscreenchange", syncBrowserFullscreen);
      return () => document.removeEventListener("fullscreenchange", syncBrowserFullscreen);
    }

    let active = true;
    let unlisten: (() => void) | undefined;
    const syncNativeFullscreen = async () => {
      try {
        const fullscreen = await getCurrentWindow().isFullscreen();
        if (
          active &&
          previewFullscreenRef.current &&
          ownsNativeFullscreenRef.current &&
          !fullscreen
        ) {
          ownsNativeFullscreenRef.current = false;
          updatePreviewFullscreen(false);
        }
      } catch {
        // Passive synchronization must never interrupt preview rendering.
      }
    };

    void getCurrentWindow()
      .onResized(() => void syncNativeFullscreen())
      .then((stopListening) => {
        if (active) unlisten = stopListening;
        else stopListening();
      });

    return () => {
      active = false;
      unlisten?.();
      if (ownsNativeFullscreenRef.current) {
        ownsNativeFullscreenRef.current = false;
        void getCurrentWindow().setFullscreen(false);
      }
    };
  }, [enabled, targetRef, updatePreviewFullscreen]);

  const togglePreviewFullscreen = useCallback(async () => {
    if (previewFullscreenRef.current) {
      updatePreviewFullscreen(false);
      if (isTauri()) {
        if (ownsNativeFullscreenRef.current) {
          ownsNativeFullscreenRef.current = false;
          await getCurrentWindow().setFullscreen(false);
        }
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
      return;
    }

    if (isTauri()) {
      const window = getCurrentWindow();
      const alreadyFullscreen = await window.isFullscreen();
      ownsNativeFullscreenRef.current = !alreadyFullscreen;
      if (!alreadyFullscreen) {
        try {
          await window.setFullscreen(true);
        } catch (error) {
          ownsNativeFullscreenRef.current = false;
          throw error;
        }
      }
      updatePreviewFullscreen(true);
      return;
    }

    const target = targetRef.current;
    if (!target?.requestFullscreen) {
      throw new Error("Preview fullscreen is unavailable in this environment.");
    }
    await target.requestFullscreen();
    updatePreviewFullscreen(true);
  }, [targetRef, updatePreviewFullscreen]);

  return { previewFullscreen, togglePreviewFullscreen };
}
