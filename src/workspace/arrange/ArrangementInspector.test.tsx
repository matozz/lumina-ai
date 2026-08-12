import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authoringTransportActions } from "@/authoring/transport";
import { projectActions, useProjectStore } from "@/stores/project";
import { useWorkspaceStore, workspaceActions } from "@/stores/workspace";
import { ArrangementInspector } from "./ArrangementInspector";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("ArrangementInspector", () => {
  beforeEach(() => {
    localStorage.clear();
    projectActions.reset();
    authoringTransportActions.reset();
    workspaceActions.reset();
  });

  it("confirms and atomically deletes the selected Arrangement", () => {
    const source = useProjectStore.getState().selectedArrangementRef;
    const reference = projectActions.duplicateArrangement(source, "Disposable Arrangement")!;
    const arrangement = useProjectStore
      .getState()
      .bundle.arrangements.find(
        (candidate) => candidate.id === reference.id && candidate.revision === reference.revision,
      )!;
    const clipCount = arrangement.tracks.reduce(
      (count, track) => count + (track.clips?.length ?? 0),
      0,
    );

    render(<ArrangementInspector />);

    const deleteButton = screen.getByRole("button", { name: "Delete Arrangement" });
    expect(deleteButton.className).toContain("h-7");
    fireEvent.click(deleteButton);
    expect(screen.getByRole("dialog", { name: "Delete Arrangement?" })).toBeTruthy();
    expect(screen.getByText(new RegExp(`contains ${clipCount} CueClip`))).toBeTruthy();
    expect(
      useProjectStore.getState().bundle.arrangements.some((item) => item.id === reference.id),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Delete Arrangement now" }));

    const state = useProjectStore.getState();
    expect(state.bundle.arrangements.some((item) => item.id === reference.id)).toBe(false);
    expect(state.selectedArrangementRef.id).not.toBe(reference.id);
    expect(state.bundle.manifest.active_arrangement_id).toBe(state.selectedArrangementRef.id);
    expect(state.history).toHaveLength(0);
    expect(state.savedHistoryCursor).toBe(-1);
    projectActions.undo();
    expect(
      useProjectStore.getState().bundle.arrangements.some((item) => item.id === reference.id),
    ).toBe(false);
  });

  it("uses a compact save status message", () => {
    render(<ArrangementInspector />);

    fireEvent.click(screen.getByRole("button", { name: "Save Arrangement" }));

    expect(useWorkspaceStore.getState().statusMessage).toBe("Arrangement saved.");
  });

  it("disables deletion when only one Arrangement remains", () => {
    const state = useProjectStore.getState();
    const reference = state.selectedArrangementRef;
    const arrangement = state.bundle.arrangements.find(
      (candidate) => candidate.id === reference.id && candidate.revision === reference.revision,
    )!;
    const bundle = structuredClone(state.bundle);
    bundle.arrangements = [structuredClone(arrangement)];
    bundle.manifest.arrangement_refs = [reference];
    bundle.manifest.active_arrangement_id = reference.id;
    useProjectStore.setState({ bundle, selectedArrangementRef: reference });

    render(<ArrangementInspector />);

    const deleteButton = screen.getByRole("button", { name: "Delete Arrangement" });
    expect((deleteButton as HTMLButtonElement).disabled).toBe(true);
    expect(deleteButton.getAttribute("title")).toBe("A Project requires at least one Arrangement.");
  });
});
