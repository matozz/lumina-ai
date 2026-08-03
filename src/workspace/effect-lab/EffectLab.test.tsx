import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineActions, engineSelectors, useEngineStore } from "@/stores/engine";
import { workspaceActions } from "@/stores/workspace";
import { createStarterProject } from "../defaultProject";
import { EffectCatalogLibrary } from "./EffectCatalogLibrary";
import { EffectLabInspector } from "./EffectLabInspector";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function EffectLabHarness() {
  const document = useEngineStore(engineSelectors.parsedDsl);
  return document ? (
    <>
      <EffectCatalogLibrary document={document} />
      <EffectLabInspector />
    </>
  ) : null;
}

describe("Effect Lab workspace", () => {
  beforeEach(() => {
    localStorage.clear();
    workspaceActions.reset();
    engineActions.loadCurrentDslCode(JSON.stringify(createStarterProject()));
  });

  it("creates, favorites, duplicates, and deletes reusable effects", async () => {
    render(<EffectLabHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Create red pulse" }));
    expect(useEngineStore.getState().parsedDsl?.effect_definitions).toHaveLength(1);
    expect(screen.getByLabelText("Favorite Red Pulse")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Favorite Red Pulse"));
    expect(screen.getByLabelText("Remove Red Pulse from favorites")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Duplicate Red Pulse"));

    await waitFor(() =>
      expect(useEngineStore.getState().parsedDsl?.effect_definitions).toHaveLength(2),
    );
    expect(screen.getByText("Red Pulse Copy")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Delete Red Pulse Copy"));
    expect(useEngineStore.getState().parsedDsl?.effect_definitions).toHaveLength(1);
  });

  it("renames an effect by saving a new definition revision", async () => {
    render(<EffectLabHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Create red pulse" }));

    fireEvent.change(screen.getByLabelText("Effect name"), { target: { value: "Red Hit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save revision r2" }));

    await waitFor(() => {
      const definition = useEngineStore.getState().parsedDsl?.effect_definitions[0];
      expect(definition).toMatchObject({ name: "Red Hit", revision: 2 });
    });
    expect(useEngineStore.getState().parsedDsl?.effect_instances[0].definition_revision).toBe(2);
  });
});
