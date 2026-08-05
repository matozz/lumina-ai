import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CueDefinition,
  EffectDefinitionDocument,
  ProductionCatalog,
  ProjectBundle,
} from "@/bridge/types";
import { authoringSessionKey, useAuthoringTransportStore } from "@/authoring/transport";
import { assetKey, createCueAsset, createEffectAsset } from "@/document/projectModel";
import { authoringDraftActions, useAuthoringDraftStore } from "@/stores/authoringDraft";
import { productionCatalogActions } from "@/stores/productionCatalog";
import { projectActions, useProjectStore } from "@/stores/project";
import { useWorkspaceStore, workspaceActions } from "@/stores/workspace";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { WorkspaceLibrary } from "../WorkspaceLibrary";
import { CueBuilderInspector } from "./CueBuilderInspector";

const bridge = vi.hoisted(() => ({
  getProductionCatalog: vi.fn(),
  resolveProductionCueRecipe: vi.fn(),
  validateProjectWorkingDraft: vi.fn(async (project: ProjectBundle) => structuredClone(project)),
}));

vi.mock("@/bridge/commands", () => ({ engine: bridge }));
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function Harness() {
  return (
    <>
      <WorkspaceLibrary workspace="cues" />
      <CueBuilderInspector />
    </>
  );
}

describe("Cue Builder safe authoring", () => {
  let cue: CueDefinition;
  let catalog: ProductionCatalog;

  beforeEach(() => {
    localStorage.clear();
    projectActions.reset();
    authoringDraftActions.reset();
    workspaceActions.reset();
    workspaceActions.setAdvancedMode(true);
    const fixture = cueFixture();
    cue = fixture.cue;
    catalog = fixture.catalog;
    productionCatalogActions.setCatalog(catalog);
    bridge.resolveProductionCueRecipe.mockReset();
    bridge.resolveProductionCueRecipe.mockImplementation(
      async (request: { cueId: string; cueRevision: number; cueName: string }) => ({
        ...structuredClone(cue),
        id: request.cueId,
        revision: request.cueRevision,
        name: request.cueName,
      }),
    );
    bridge.validateProjectWorkingDraft.mockClear();
  });

  it("resolves a Production recipe into a session-only draft before save", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /Four on Floor.*1 effect/ }));

    await waitFor(() => expect(screen.getByLabelText("Cue name")).toBeTruthy());
    expect(useProjectStore.getState().bundle.cues).toHaveLength(0);
    expect(useAuthoringDraftStore.getState().cue?.mode).toBe("new");
    expect(screen.getByText("Production Recipes")).toBeTruthy();
    const selected = useProjectStore.getState().selectedCueRef!;
    await waitFor(() =>
      expect(
        useAuthoringTransportStore.getState().sessions[
          authoringSessionKey("cue", assetKey(selected))
        ]?.playback,
      ).toBe("stopped"),
    );
  });

  it("selects a built-in Cue for Arrange without copying it into the Project", async () => {
    render(<WorkspaceLibrary workspace="arrange" />);

    expect(screen.getByText("Built-in Cues")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Four on Floor.*1 effect/ }));

    await waitFor(() =>
      expect(useWorkspaceStore.getState().selectedArrangeBuiltInCue?.recipeRef).toEqual({
        id: "recipe.four-on-floor",
        revision: 1,
      }),
    );
    const state = useProjectStore.getState();
    expect(state.selectedCueRef).toBeNull();
    expect(state.bundle.cues).toHaveLength(0);
    expect(state.bundle.effects).toHaveLength(0);
    expect(useWorkspaceStore.getState().selectedArrangeBuiltInCue?.cue.id).toMatch(
      /^__builtin-cue-four-on-floor/,
    );
    expect(useAuthoringDraftStore.getState().cue).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Four on Floor.*1 effect/ }));
    expect(useProjectStore.getState().bundle.cues).toHaveLength(0);
    expect(bridge.resolveProductionCueRecipe).toHaveBeenCalledTimes(1);
  });

  it("shows bars and hides internal layer controls by default", async () => {
    workspaceActions.setAdvancedMode(false);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Four on Floor.*1 effect/ }));

    await waitFor(() => expect(screen.getByLabelText("Cue length")).toBeTruthy());
    expect(screen.getByText("1 bar")).toBeTruthy();
    expect(screen.queryByText("Exact length · ticks")).toBeNull();
    expect(screen.queryByText("Deterministic seed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add selected Effect" })).toBeNull();
  });

  it("keeps mute, solo, overrides, and automation local until one immutable save", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Four on Floor.*1 effect/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Mute layer 2" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Mute layer 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Solo layer 1" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Add automation" })[0]);

    expect(useProjectStore.getState().bundle.cues).toHaveLength(0);
    expect(useAuthoringDraftStore.getState().cue).toMatchObject({
      mutedLayerIds: [cue.layers[1].id],
      soloLayerId: cue.layers[0].id,
    });
    expect(useAuthoringDraftStore.getState().cue?.working.automation_lanes).toHaveLength(1);

    const save = screen.getByRole("button", { name: "Save Cue" });
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
    fireEvent.click(save);

    const project = useProjectStore.getState();
    expect(project.bundle.cues).toHaveLength(1);
    expect(project.bundle.effects.some((effect) => effect.id === catalog.effects[0].id)).toBe(true);
    expect(project.historyCursor).toBe(1);
  });

  it("requires confirmation before adding a high-risk strobe layer", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Four on Floor.*1 effect/ }));
    await waitFor(() => expect(screen.getByLabelText("Cue name")).toBeTruthy());

    const strobe = catalog.effects.find((effect) => effect.catalog.strobe_risk === "high")!;
    act(() => projectActions.setSelectedEffectRef({ id: strobe.id, revision: strobe.revision }));
    const add = screen.getByRole("button", { name: "Add selected Effect" });
    await waitFor(() => expect(add.hasAttribute("disabled")).toBe(false));
    fireEvent.click(add);

    expect(screen.getByRole("dialog", { name: "Confirm high strobe risk" })).toBeTruthy();
    expect(useAuthoringDraftStore.getState().cue?.working.layers).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Add high-risk layer" }));
    expect(useAuthoringDraftStore.getState().cue?.working.layers).toHaveLength(3);
  });

  it("duplicates automation with unique IDs and keeps layer ordering deterministic", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Four on Floor.*1 effect/ }));
    await waitFor(() => expect(screen.getByLabelText("Cue name")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: "Add automation" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate selected layer" }));

    const duplicated = useAuthoringDraftStore.getState().cue?.working;
    expect(duplicated?.layers).toHaveLength(3);
    expect(new Set(duplicated?.layers.map((layer) => layer.id)).size).toBe(3);
    expect(duplicated?.automation_lanes).toHaveLength(2);
    expect(new Set(duplicated?.automation_lanes?.map((lane) => lane.id)).size).toBe(2);
    expect(duplicated?.layers.map((layer) => layer.layer)).toEqual([0, 1, 2]);

    const duplicateId = useAuthoringDraftStore.getState().cue?.selectedLayerId;
    fireEvent.click(screen.getByRole("button", { name: "Move selected layer up" }));
    const reordered = useAuthoringDraftStore.getState().cue?.working;
    expect(reordered?.layers[0].id).toBe(duplicateId);
    expect(reordered?.layers.map((layer) => layer.layer)).toEqual([0, 1, 2]);
  });

  it("keeps long revision labels inside the shrinkable Cue inspector track", async () => {
    catalog.effects[0].name = "Breathe Custom With A Deliberately Long Production Revision Name";
    productionCatalogActions.setCatalog(catalog);
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /Four on Floor.*1 effect/ }));
    await waitFor(() => expect(screen.getByText("Selected Effect")).toBeTruthy());

    const editor = screen
      .getByText("Selected Effect")
      .closest('[data-layout-region="cue-layer-editor"]');
    const trigger = editor?.querySelector<HTMLElement>('[data-slot="select-trigger"]');
    const value = trigger?.querySelector<HTMLElement>('[data-slot="select-value"]');

    expect(editor?.className).toContain("min-w-0");
    expect(editor?.className).toContain("grid-cols-[minmax(0,1fr)]");
    expect(trigger?.className).toContain("min-w-0");
    expect(trigger?.className).toContain("max-w-full");
    expect(value?.className).toContain("min-w-0");
    expect(value?.className).toContain("truncate");
  });
});

function cueFixture() {
  const scratch = createStarterProjectBundle();
  const effect = createEffectAsset(scratch, "Pulse");
  effect.id = "builtin.intensity.pulse";
  effect.source = "built_in";
  effect.catalog.family = "intensity";
  effect.catalog.category = "Rhythm";
  effect.catalog.visibility = "standard";
  effect.catalog.layout_capabilities = ["any"];
  effect.catalog.parameter_summary = ["speed"];
  effect.parameters = effect.parameters.map((parameter) => ({
    ...parameter,
    required: true,
    help: parameter.name,
    safe_fallback: structuredClone(parameter.default_value),
    override_policy: "cue_override",
    advanced: false,
  }));
  scratch.effects.push(effect);
  const strobe = structuredClone(effect);
  strobe.id = "builtin.strobe.safe-pulse";
  strobe.name = "Safe Strobe Pulse";
  strobe.catalog.family = "strobe";
  strobe.catalog.category = "Strobe";
  strobe.catalog.strobe_risk = "high";
  scratch.effects.push(strobe);
  const reference = { id: effect.id, revision: effect.revision };
  const cue = createCueAsset(scratch, [reference, reference], "Four on Floor");
  cue.id = "cue-four-on-floor";
  cue.layers[0].id = "kick-a";
  cue.layers[1].id = "kick-b";
  cue.layers[1].mix_overrides = [{ attribute_id: "intensity", policy: "htp" }];
  const catalog: ProductionCatalog = {
    schema_version: 1,
    effects: [effect satisfies EffectDefinitionDocument, strobe satisfies EffectDefinitionDocument],
    cue_recipes: [
      {
        schema_version: 1,
        id: "recipe.four-on-floor",
        revision: 1,
        name: "Four on Floor",
        description: "A single coherent rhythmic layer.",
        nominal_length_ticks: 3_840,
        trigger_policy: { mode: "timeline", quantize: "beat" },
        layers: cue.layers.slice(0, 1).map((layer) => ({
          id: layer.id,
          effect_ref: layer.effect_ref,
          target: { type: "all" },
          phase: layer.phase,
          seed: layer.seed,
        })),
      },
    ],
  };
  return { cue, catalog };
}
