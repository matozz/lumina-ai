import { describe, expect, it } from "vitest";
import { isTextEditingTarget } from "./dom";

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
