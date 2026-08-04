import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exactAsset } from "@/document/projectModel";
import { projectActions, useProjectStore } from "@/stores/project";
import { WorkspaceLibrary } from "../WorkspaceLibrary";
import { EffectLabInspector } from "./EffectLabInspector";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function EffectLabHarness() {
  return (
    <>
      <WorkspaceLibrary workspace="effect-lab" />
      <EffectLabInspector />
    </>
  );
}

describe("Effect Lab Project assets", () => {
  beforeEach(() => {
    localStorage.clear();
    projectActions.reset();
  });

  it("creates reusable target-agnostic Pulse and Gradient assets", () => {
    render(<EffectLabHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Pulse" }));
    fireEvent.click(screen.getByRole("button", { name: "Gradient" }));

    expect(useProjectStore.getState().bundle.effects.map((effect) => effect.name)).toEqual([
      "Pulse",
      "Gradient",
    ]);
    expect(screen.getByText("target-agnostic · r1")).toBeTruthy();
  });

  it("renames an Effect Draft without adding a target reference", async () => {
    const reference = projectActions.createEffect("Pulse")!;
    render(<EffectLabHarness />);

    fireEvent.change(screen.getByLabelText("Effect name"), { target: { value: "Pulse Hit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Draft revision" }));

    await waitFor(() => {
      const selected = useProjectStore.getState().selectedEffectRef;
      expect(exactAsset(useProjectStore.getState().bundle.effects, selected)?.name).toBe(
        "Pulse Hit",
      );
    });
    expect(
      JSON.stringify(exactAsset(useProjectStore.getState().bundle.effects, reference)),
    ).not.toContain("target_set");
  });
});
