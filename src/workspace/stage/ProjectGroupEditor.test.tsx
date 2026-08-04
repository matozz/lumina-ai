import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FixtureFramePayload } from "@/bridge/types";
import { activeStage, exactAsset } from "@/document/projectModel";
import { projectActions, useProjectStore } from "@/stores/project";
import { ProjectGroupEditor } from "./ProjectGroupEditor";

describe("ProjectGroupEditor", () => {
  beforeEach(() => {
    localStorage.clear();
    projectActions.reset();
  });

  it("edits Group membership only through an explicit Stage revision", () => {
    const preview = vi.fn();
    window.addEventListener("workspace:test-fixtures", preview);
    render(<ProjectGroupEditor />);

    fireEvent.click(screen.getByRole("button", { name: "left" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const outputs = preview.mock.calls[0][0].detail as FixtureFramePayload[];
    expect(
      outputs.filter(
        (output) =>
          output.attributes[0].value.type === "scalar" && output.attributes[0].value.value === 1,
      ),
    ).toHaveLength(8);

    fireEvent.click(screen.getByRole("button", { name: "Save revision" }));
    const state = useProjectStore.getState();
    expect(activeStage(state.bundle).revision).toBe(2);
    expect(activeStage(state.bundle).groups[0].fixtures).toHaveLength(8);
    expect(
      exactAsset(state.bundle.stages, { id: "main-stage", revision: 1 })?.groups[0].fixtures,
    ).toEqual({
      range: [1, 16],
    });

    window.removeEventListener("workspace:test-fixtures", preview);
  });
});
