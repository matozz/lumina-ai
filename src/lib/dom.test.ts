import { describe, expect, it } from "vitest";
import {
  isExplicitTextSelectionTarget,
  isNativeDragTarget,
  isNativeDropTarget,
  isTextEditingTarget,
  shouldPreventWebViewShortcut,
} from "./dom";

describe("isTextEditingTarget", () => {
  it("recognizes native and contenteditable editing targets", () => {
    const input = document.createElement("input");
    const editor = document.createElement("div");
    const child = document.createElement("span");
    editor.contentEditable = "true";
    editor.append(child);

    expect(isTextEditingTarget(input)).toBe(true);
    expect(isTextEditingTarget(child)).toBe(true);
    expect(isTextEditingTarget(document.createElement("button"))).toBe(false);
  });
});

describe("app interaction boundaries", () => {
  it("allows text selection only on explicit copy surfaces", () => {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    pre.dataset.userSelect = "text";
    pre.append(code);

    expect(isExplicitTextSelectionTarget(code)).toBe(true);
    expect(isExplicitTextSelectionTarget(document.createElement("p"))).toBe(false);
  });

  it("allows only explicitly draggable elements to start native drag", () => {
    const resource = document.createElement("button");
    const icon = document.createElement("span");
    resource.setAttribute("draggable", "true");
    resource.append(icon);

    expect(isNativeDragTarget(icon)).toBe(true);
    expect(isNativeDragTarget(document.createElement("img"))).toBe(false);
  });

  it("allows drops only inside an explicit native drop target", () => {
    const track = document.createElement("div");
    const child = document.createElement("span");
    track.dataset.nativeDropTarget = "true";
    track.append(child);

    expect(isNativeDropTarget(child)).toBe(true);
    expect(isNativeDropTarget(document.createElement("main"))).toBe(false);
  });

  it("blocks WebView defaults without stealing text-editing shortcuts", () => {
    const surface = document.createElement("div");
    const input = document.createElement("input");
    const event = (
      key: string,
      target: Element,
      modifiers: Partial<WebViewShortcutEvent> = {},
    ) => ({
      altKey: false,
      ctrlKey: false,
      key,
      metaKey: false,
      target,
      ...modifiers,
    });

    expect(shouldPreventWebViewShortcut(event("a", surface, { metaKey: true }))).toBe(true);
    expect(shouldPreventWebViewShortcut(event("ArrowLeft", surface, { metaKey: true }))).toBe(true);
    expect(shouldPreventWebViewShortcut(event("Backspace", surface))).toBe(true);
    expect(shouldPreventWebViewShortcut(event("r", input, { metaKey: true }))).toBe(true);
    expect(shouldPreventWebViewShortcut(event("a", input, { metaKey: true }))).toBe(false);
    expect(shouldPreventWebViewShortcut(event("ArrowLeft", input, { altKey: true }))).toBe(false);
  });
});

interface WebViewShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
}
