import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineActions, useEngineStore } from "@/stores/engine";
import { workspaceActions } from "@/stores/workspace";
import { createStarterProject } from "../defaultProject";
import { StageSetupInspector } from "./StageSetupInspector";

const commandMocks = vi.hoisted(() => ({
  previewDSL: vi.fn().mockResolvedValue({
    success: true,
    show_revision: null,
    fixture_count: 9,
    layout_coords: Array.from({ length: 9 }, (_, index) => ({
      id: index + 1,
      x: (index % 4) * 64,
      y: Math.floor(index / 4) * 64,
      type: "pixel",
    })),
    group_names: ["All fixtures"],
    phasers: [],
    sequence_names: [],
    errors: [],
    warnings: [],
    migration_report: { from_version: 4, to_version: 4, changes: [] },
  }),
}));

vi.mock("@/bridge/commands", () => ({ engine: commandMocks }));
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("StageSetupInspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    workspaceActions.reset();
    engineActions.loadCurrentDslCode(JSON.stringify(createStarterProject()));
  });

  it("applies profile, count, addressing, and layout as one Draft transaction", async () => {
    const onDraftLayout = vi.fn();
    window.addEventListener("engine:draft-layout", onDraftLayout);
    render(<StageSetupInspector />);

    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply to Draft" }));

    await waitFor(() => expect(commandMocks.previewDSL).toHaveBeenCalledOnce());
    const document = useEngineStore.getState().parsedDsl;
    expect(document?.patch[0].id_range).toEqual([1, 9]);
    expect(document?.layout.generator).toMatchObject({ shape: "matrix", rows: 3, columns: 4 });
    expect(document?.groups[0].fixtures).toEqual({ range: [1, 9] });
    expect(onDraftLayout).toHaveBeenCalledOnce();
    expect(useEngineStore.getState().isDocumentDirty).toBe(true);

    window.removeEventListener("engine:draft-layout", onDraftLayout);
  });

  it("previews a named group without publishing or changing the document", () => {
    const before = useEngineStore.getState().currentDslCode;
    const onFixtureTest = vi.fn();
    window.addEventListener("workspace:test-fixtures", onFixtureTest);
    render(<StageSetupInspector />);

    fireEvent.click(screen.getByRole("button", { name: "Test All fixtures" }));

    expect(onFixtureTest).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Stop testing All fixtures" }));
    expect(onFixtureTest).toHaveBeenCalledTimes(2);
    expect(useEngineStore.getState().currentDslCode).toBe(before);
    expect(commandMocks.previewDSL).not.toHaveBeenCalled();

    window.removeEventListener("workspace:test-fixtures", onFixtureTest);
  });
});
