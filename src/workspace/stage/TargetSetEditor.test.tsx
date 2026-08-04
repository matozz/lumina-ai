import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FixtureFramePayload } from "@/bridge/types";
import { activeStage, exactAsset } from "@/document/projectModel";
import { projectActions, useProjectStore } from "@/stores/project";
import { TargetSetEditor } from "./TargetSetEditor";

describe("TargetSetEditor", () => {
  beforeEach(() => {
    localStorage.clear();
    projectActions.reset();
  });

  it("visually edits Rows, previews fixture output, and saves one Stage revision", () => {
    const preview = vi.fn();
    window.addEventListener("workspace:test-fixtures", preview);
    render(<TargetSetEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Rows" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "Fixture 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const outputs = preview.mock.calls[0][0].detail as FixtureFramePayload[];
    expect(outputs).toHaveLength(16);
    expect(outputs[0].attributes[0].value).toEqual({ type: "scalar", value: 0.04 });
    expect(outputs[4].attributes[0].value).toEqual({ type: "scalar", value: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Save revision" }));
    const state = useProjectStore.getState();
    const oldRows = exactAsset(state.bundle.stages, {
      id: "main-stage",
      revision: 1,
    })?.target_sets.find((target) => target.id === "rows");
    const nextRows = activeStage(state.bundle).target_sets.find((target) => target.id === "rows");
    expect(oldRows?.selector).toMatchObject({ indices: [0, 1, 2, 3] });
    expect(nextRows?.selector).toMatchObject({ indices: [1, 2, 3] });
    expect(activeStage(state.bundle).revision).toBe(2);

    window.removeEventListener("workspace:test-fixtures", preview);
  });
});
