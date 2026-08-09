import { describe, expect, it } from "vitest";
import {
  arrangementShortcutOverlayIsOpen,
  shortcutEventIsBlocked,
  shortcutTargetIsBlocked,
} from "./useArrangementEditorShortcuts";

describe("Arrange shortcut focus rules", () => {
  it("blocks editor shortcuts inside form fields and overlay content", () => {
    const input = document.createElement("input");
    const dialog = document.createElement("div");
    const dialogButton = document.createElement("button");
    const selectTrigger = document.createElement("button");
    dialog.setAttribute("role", "dialog");
    selectTrigger.setAttribute("role", "combobox");
    dialog.append(dialogButton);

    expect(shortcutTargetIsBlocked(input)).toBe(true);
    expect(shortcutTargetIsBlocked(dialogButton)).toBe(true);
    expect(shortcutTargetIsBlocked(selectTrigger)).toBe(false);
    expect(shortcutTargetIsBlocked(document.createElement("button"))).toBe(false);
  });

  it("blocks an actually open overlay without permanently blocking its trigger", () => {
    const trigger = document.createElement("button");
    trigger.setAttribute("role", "combobox");
    const popover = document.createElement("div");
    popover.dataset.slot = "popover-content";
    popover.setAttribute("data-open", "");
    document.body.append(trigger, popover);

    expect(shortcutTargetIsBlocked(trigger)).toBe(false);
    expect(arrangementShortcutOverlayIsOpen(document)).toBe(true);

    popover.removeAttribute("data-open");
    expect(arrangementShortcutOverlayIsOpen(document)).toBe(false);
    trigger.remove();
    popover.remove();
  });

  it("checks every target in a composed event path", () => {
    const input = document.createElement("input");
    const event = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, composed: true });
    input.addEventListener("keydown", (current) => {
      expect(shortcutEventIsBlocked(current)).toBe(true);
    });

    document.body.append(input);
    input.dispatchEvent(event);
    input.remove();
  });
});
