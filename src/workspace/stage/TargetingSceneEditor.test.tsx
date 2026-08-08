import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FixtureFramePayload } from "@/bridge/types";
import { activeStage } from "@/document/projectModel";
import { projectActions, useProjectStore } from "@/stores/project";
import { TargetingSceneEditor } from "./TargetingSceneEditor";

describe("TargetingSceneEditor", () => {
  beforeEach(() => {
    localStorage.clear();
    projectActions.reset();
  });

  it("previews a partition and saves loop/phase scene controls", () => {
    const preview = vi.fn();
    window.addEventListener("workspace:test-fixtures", preview);
    render(<TargetingSceneEditor />);

    expect(screen.getByLabelText("Step 11 transition")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Preview step 2" }));
    const outputs = preview.mock.calls[0][0].detail as FixtureFramePayload[];
    const selected = outputs.filter(
      (output) =>
        output.attributes[0].value.type === "scalar" && output.attributes[0].value.value === 1,
    );
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.length).toBeLessThan(100);

    fireEvent.click(screen.getByRole("button", { name: "Loop scene" }));
    fireEvent.click(screen.getByRole("button", { name: "Save pattern" }));

    const stage = activeStage(useProjectStore.getState().bundle);
    expect(stage.revision).toBe(2);
    expect(stage.targeting_scenes?.[0]).toMatchObject({
      looped: true,
      phase_continuity: true,
    });

    window.removeEventListener("workspace:test-fixtures", preview);
  });

  it("builds the production All to 3×3 Zones to All sequence", () => {
    render(<TargetingSceneEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Build All → partitions → All" }));

    expect(screen.getByRole("button", { name: "Preview step 11" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Preview step 12" })).toBeNull();
    expect(screen.getByLabelText("Step 2 TargetSet").textContent).toContain("zones-3x3");
    expect(screen.getByLabelText("Step 11 transition").textContent).toContain("weighted");
  });
});
