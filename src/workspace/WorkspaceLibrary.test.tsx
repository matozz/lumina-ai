import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authoringSessionKey, useAuthoringTransportStore } from "@/authoring/transport";
import { engine } from "@/bridge/commands";
import type { ProductionCatalog } from "@/bridge/types";
import { assetKey, createEffectAsset } from "@/document/projectModel";
import { engineActions, useEngineStore } from "@/stores/engine";
import { productionCatalogActions } from "@/stores/productionCatalog";
import { useWorkspaceStore, workspaceActions } from "@/stores/workspace";
import { projectActions, useProjectStore } from "@/stores/project";
import { createStarterProject } from "./defaultProject";
import { createEffectPair } from "./effect-lab/effectFactory";
import { WorkspaceLibrary } from "./WorkspaceLibrary";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("Live workspace library", () => {
  beforeEach(() => {
    localStorage.clear();
    workspaceActions.reset();
    projectActions.reset();
    productionCatalogActions.reset();
    useEngineStore.setState(useEngineStore.getInitialState(), true);
  });

  it("shows only effects from the immutable Live Snapshot", () => {
    const draft = createStarterProject();
    const pair = createEffectPair(draft, "Draft-only Pulse");
    draft.effect_definitions.push(pair.definition);
    draft.effect_instances.push(pair.instance);
    engineActions.loadCurrentDslCode(JSON.stringify(draft));
    engineActions.setLiveEffects([
      {
        instance_id: "live-wash-instance",
        definition_id: "live-wash",
        definition_revision: 2,
        name: "Live Wash",
        target_group_id: "all-fixtures",
      },
    ]);

    render(<WorkspaceLibrary workspace="live" />);

    expectCompactLibraryItem(screen.getByText("Live Wash").closest("button"));
    expect(screen.queryByText("Draft-only Pulse")).toBeNull();
    expect(screen.queryByText(/r2/)).toBeNull();
  });

  it("keeps generated Layout previews available without exposing advanced asset actions", () => {
    render(<WorkspaceLibrary workspace="stage" />);

    expectCompactLibraryItem(screen.getByRole("button", { name: /Main Matrix 20×20/ }));
    expect(screen.getByText("Generated")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Sine Ribbon 50 Formula/ }));
    expect(useProjectStore.getState().selectedLayoutRef).toEqual({
      id: "builtin.layout.formula-sine-50",
      revision: 1,
    });
    expect(screen.queryByRole("button", { name: /Duplicate Main Matrix 20×20/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Duplicate Sine Ribbon 50/ })).toBeNull();
  });

  it("opens an Effect preview stopped until the user presses Play", () => {
    const reference = projectActions.createEffect("Manual preview")!;

    render(<WorkspaceLibrary workspace="effect-lab" />);

    const key = authoringSessionKey("effect", assetKey(reference));
    expectCompactLibraryItem(screen.getByText("Manual preview").closest("button"));
    expect(useAuthoringTransportStore.getState().sessions[key].playback).toBe("stopped");
  });

  it("explains missing recipe areas and opens the shared area editor", () => {
    const bundle = structuredClone(useProjectStore.getState().bundle);
    const stage = bundle.stages.find(
      (candidate) =>
        candidate.id === bundle.manifest.stage_ref.id &&
        candidate.revision === bundle.manifest.stage_ref.revision,
    )!;
    stage.target_sets = stage.target_sets.filter((target) => target.selector.type !== "rows");
    useProjectStore.setState({ bundle });
    const effect = createEffectAsset(bundle, "Chase");
    effect.id = "builtin.intensity.chase";
    effect.source = "built_in";
    effect.catalog.required_attributes = ["intensity"];
    const catalog: ProductionCatalog = {
      schema_version: 1,
      layouts: [],
      arrangements: [],
      project_templates: [],
      effects: [effect],
      cue_recipes: [
        {
          schema_version: 1,
          id: "recipe.row-chase",
          revision: 1,
          name: "Matrix Spatial Chase",
          description: "Chase fixture rows.",
          nominal_length_ticks: 3_840,
          trigger_policy: { mode: "timeline", quantize: "bar" },
          layers: [
            {
              id: "chase",
              effect_ref: { id: effect.id, revision: effect.revision },
              target: { type: "rows" },
              phase: 0,
              seed: "2000000000000002",
            },
          ],
        },
      ],
    };
    productionCatalogActions.setCatalog(catalog);

    render(<WorkspaceLibrary workspace="cues" />);

    const unavailable = screen.getByRole("button", {
      name: /Matrix Spatial Chase.*Needs Rows area/,
    });
    expectCompactLibraryItem(unavailable);
    expect(unavailable.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Edit fixture areas" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Fixture area editor")).toBeTruthy();
  });

  it("clears a stale My Cue selection while a built-in Cue resolves for Arrange", () => {
    const customEffect = projectActions.createEffect("Custom Pulse")!;
    const customCue = projectActions.createCue([customEffect], "Custom Cue")!;
    const bundle = useProjectStore.getState().bundle;
    const effect = createEffectAsset(bundle, "Catalog Pulse");
    effect.id = "builtin.intensity.catalog-pulse";
    effect.source = "built_in";
    productionCatalogActions.setCatalog({
      schema_version: 1,
      layouts: [],
      arrangements: [],
      project_templates: [],
      effects: [effect],
      cue_recipes: [
        {
          schema_version: 1,
          id: "recipe.catalog-pulse",
          revision: 1,
          name: "Catalog Pulse",
          description: "Resolve a full-stage pulse.",
          nominal_length_ticks: 3_840,
          trigger_policy: { mode: "timeline", quantize: "beat" },
          layers: [
            {
              id: "layer_catalog_pulse",
              effect_ref: { id: effect.id, revision: effect.revision },
              target: { type: "all" },
              phase: 0,
              seed: "2000000000000003",
            },
          ],
        },
      ],
    });
    const resolve = vi
      .spyOn(engine, "resolveProductionCueRecipe")
      .mockReturnValue(new Promise(() => undefined));

    render(<WorkspaceLibrary workspace="arrange" />);
    expect(useProjectStore.getState().selectedCueRef).toEqual(customCue);

    fireEvent.click(screen.getByRole("button", { name: /Catalog Pulse/ }));

    expect(useProjectStore.getState().selectedCueRef).toBeNull();
    expect(useWorkspaceStore.getState().selectedArrangeBuiltInCue).toBeNull();
    resolve.mockRestore();
  });
});

function expectCompactLibraryItem(item: Element | null) {
  expect(item).toBeInstanceOf(HTMLButtonElement);
  expect(item?.className).toContain("h-6");
  expect(item?.className).toContain("items-center");
  expect(item?.className).toContain("py-0");
}
