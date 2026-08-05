import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EffectDefinitionDocument, ProductionCatalog } from "@/bridge/types";
import { createEffectAsset, exactAsset } from "@/document/projectModel";
import { authoringDraftActions } from "@/stores/authoringDraft";
import { productionCatalogActions } from "@/stores/productionCatalog";
import { projectActions, useProjectStore } from "@/stores/project";
import { useWorkspaceStore, workspaceActions } from "@/stores/workspace";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { WorkspaceLibrary } from "../WorkspaceLibrary";
import { EffectLabInspector } from "./EffectLabInspector";

const bridge = vi.hoisted(() => ({
  validateEffectWorkingDraft: vi.fn(async (effect: EffectDefinitionDocument) =>
    structuredClone(effect),
  ),
  getProductionCatalog: vi.fn(),
}));

vi.mock("@/bridge/commands", () => ({ engine: bridge }));
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

describe("Effect Lab safe authoring", () => {
  beforeEach(() => {
    localStorage.clear();
    projectActions.reset();
    authoringDraftActions.reset();
    workspaceActions.setAdvancedMode(true);
    productionCatalogActions.setCatalog(productionCatalog());
    bridge.validateEffectWorkingDraft.mockClear();
  });

  it("separates read-only Production revisions from Project drafts", async () => {
    render(<EffectLabHarness />);

    expect(screen.getByText("Production Catalog")).toBeTruthy();
    expect(screen.getByText("Project Drafts")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Pulse.*intensity/ })).toBeTruthy(),
    );
    expect(screen.getByText("Production Effect")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Customize" })).toBeTruthy();
  });

  it("turns a selected Effect into a Cue through the primary action", async () => {
    workspaceActions.setAdvancedMode(false);
    render(<EffectLabHarness />);

    const useInCue = await screen.findByRole("button", { name: "Use in Cue" });
    fireEvent.click(useInCue);

    expect(useWorkspaceStore.getState().activeWorkspace).toBe("cues");
    expect(useProjectStore.getState().selectedCueRef).toBeTruthy();
  });

  it("customizes a built-in without mutating or persisting its pinned identity", async () => {
    render(<EffectLabHarness />);

    await waitFor(() => screen.getByRole("button", { name: "Customize" }));
    fireEvent.click(screen.getByRole("button", { name: "Customize" }));
    fireEvent.change(screen.getByLabelText("Effect name"), { target: { value: "Pulse House" } });

    const save = screen.getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
    fireEvent.click(save);

    const state = useProjectStore.getState();
    const saved = exactAsset(state.bundle.effects, state.selectedEffectRef);
    expect(saved).toMatchObject({ name: "Pulse House", source: "project_local", revision: 1 });
    expect(state.bundle.effects.some((effect) => effect.id === "builtin.intensity.pulse")).toBe(
      false,
    );
  });

  it("saves edits as a new exact revision and preserves beat-synced speed choices", async () => {
    const original = projectActions.createEffect("Pulse")!;
    render(<EffectLabHarness />);

    fireEvent.click(screen.getByLabelText("Speed"));
    expect(screen.queryByRole("option", { name: "0.375×" })).toBeNull();
    const doubleSpeed = screen.getByRole("option", { name: "2×" });
    fireEvent.mouseMove(doubleSpeed);
    fireEvent.click(doubleSpeed);

    const save = screen.getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
    fireEvent.click(save);

    const state = useProjectStore.getState();
    const next = exactAsset(state.bundle.effects, state.selectedEffectRef);
    expect(next?.revision).toBe(2);
    expect(next?.parameters.find((parameter) => parameter.id === "speed")?.default_value).toEqual({
      type: "scalar",
      value: 2,
    });
    expect(exactAsset(state.bundle.effects, original)?.revision).toBe(1);
  });
});

function productionCatalog(): ProductionCatalog {
  const bundle = createStarterProjectBundle();
  const pulse = asBuiltin(
    createEffectAsset(bundle, "Pulse"),
    "builtin.intensity.pulse",
    "intensity",
  );
  const gradient = asBuiltin(
    createEffectAsset(bundle, "Gradient"),
    "builtin.color.gradient",
    "color",
  );
  return { schema_version: 1, effects: [pulse, gradient], cue_recipes: [] };
}

function asBuiltin(
  effect: EffectDefinitionDocument,
  id: string,
  family: NonNullable<EffectDefinitionDocument["catalog"]["family"]>,
) {
  effect.id = id;
  effect.source = "built_in";
  effect.catalog.family = family;
  effect.catalog.category = "Production";
  effect.catalog.visibility = "standard";
  effect.catalog.layout_capabilities = ["any"];
  effect.catalog.parameter_summary = ["speed"];
  return effect;
}
