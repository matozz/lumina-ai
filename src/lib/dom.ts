export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.matches("input, textarea, select") || target.closest('[contenteditable="true"]') !== null
  );
}

export function isExplicitTextSelectionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-user-select="text"]') !== null;
}

export function isNativeDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const draggable = target.closest("[draggable]");
  return draggable?.getAttribute("draggable") === "true";
}

export function isNativeDropTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-native-drop-target]") !== null;
}

interface WebViewShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  target: EventTarget | null;
}

const WEB_VIEW_COMMAND_DEFAULTS = new Set(["f", "p", "r", "s", "u", "+", "=", "-", "0", "[", "]"]);

export function shouldPreventWebViewShortcut(event: WebViewShortcutEvent): boolean {
  const key = event.key.toLowerCase();
  const command = event.metaKey || event.ctrlKey;
  const editing = isTextEditingTarget(event.target);

  if (command && WEB_VIEW_COMMAND_DEFAULTS.has(key)) return true;
  if (command && key === "a") return !editing && !isExplicitTextSelectionTarget(event.target);
  if (command && key.startsWith("arrow")) return !editing;
  if (event.altKey && (key === "arrowleft" || key === "arrowright")) return !editing;
  return key === "backspace" && !editing;
}
