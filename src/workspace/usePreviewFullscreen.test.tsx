import { createRef } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePreviewFullscreen } from "./usePreviewFullscreen";

const native = vi.hoisted(() => ({
  fullscreen: false,
  isFullscreen: vi.fn(async () => native.fullscreen),
  onResized: vi.fn(async () => vi.fn()),
  setFullscreen: vi.fn(async (next: boolean) => {
    native.fullscreen = next;
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => native }));

describe("usePreviewFullscreen", () => {
  beforeEach(() => {
    native.fullscreen = false;
    native.isFullscreen.mockClear();
    native.onResized.mockClear();
    native.setFullscreen.mockClear();
  });

  it("owns and restores native fullscreen while isolating the preview surface", async () => {
    const targetRef = createRef<HTMLElement>();
    const { result, unmount } = renderHook(() => usePreviewFullscreen(targetRef, true));

    await act(() => result.current.togglePreviewFullscreen());
    expect(native.setFullscreen).toHaveBeenCalledWith(true);
    expect(result.current.previewFullscreen).toBe(true);

    await act(() => result.current.togglePreviewFullscreen());
    expect(native.setFullscreen).toHaveBeenLastCalledWith(false);
    expect(result.current.previewFullscreen).toBe(false);
    unmount();
  });

  it("does not exit a system fullscreen state it did not create", async () => {
    native.fullscreen = true;
    const targetRef = createRef<HTMLElement>();
    const { result } = renderHook(() => usePreviewFullscreen(targetRef, true));

    await act(() => result.current.togglePreviewFullscreen());
    await act(() => result.current.togglePreviewFullscreen());

    expect(native.setFullscreen).not.toHaveBeenCalled();
  });
});
