import { describe, expect, it } from "vitest";
import { shortcutTargetIsBlocked } from "./useArrangementEditorShortcuts";

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
    expect(shortcutTargetIsBlocked(selectTrigger)).toBe(true);
    expect(shortcutTargetIsBlocked(document.createElement("button"))).toBe(false);
  });
});
