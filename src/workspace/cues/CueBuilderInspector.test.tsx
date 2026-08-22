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
import { parameterInitialValue } from "@/document/effectParameter";
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
    const state = useProjectStore.getState();
    const bundle = structuredClone(state.bundle);
    const initialCueRefs = bundle.cues.map(assetKey);
    bundle.manifest.layout_refs = [
      structuredClone(bundle.layouts[0]) as unknown as (typeof bundle.manifest.layout_refs)[number],
    ];
    useProjectStore.setState({ bundle });

    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /Four on Floor.*1 effect/ }));

    await waitFor(() => expect(screen.getByLabelText("Cue name")).toBeTruthy());
    expect(useProjectStore.getState().bundle.cues.map(assetKey)).toEqual(initialCueRefs);
    expect(useAuthoringDraftStore.getState().cue?.mode).toBe("new");
    expect(screen.getByText("Production Recipes")).toBeTruthy();
    expect(
      bridge.resolveProductionCueRecipe.mock.calls[0]![0].project.manifest.layout_refs[0],
    ).toEqual({ id: bundle.layouts[0]!.id, revision: bundle.layouts[0]!.revision });
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
    const initialCueRefs = useProjectStore.getState().bundle.cues.map(assetKey);
    const initialEffectRefs = useProjectStore.getState().bundle.effects.map(assetKey);
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
    expect(state.bundle.cues.map(assetKey)).toEqual(initialCueRefs);
    expect(state.bundle.effects.map(assetKey)).toEqual(initialEffectRefs);
    expect(useWorkspaceStore.getState().selectedArrangeBuiltInCue?.cue.id).toMatch(
      /^__builtin-cue-four-on-floor/,
    );
    expect(useAuthoringDraftStore.getState().cue).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Four on Floor.*1 effect/ }));
    expect(useProjectStore.getState().bundle.cues.map(assetKey)).toEqual(initialCueRefs);
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

  it("labels saved Cues consistently and exposes deletion in basic mode", async () => {
    workspaceActions.setAdvancedMode(false);
    const state = useProjectStore.getState();
    const bundle = structuredClone(state.bundle);
    const savedCue = structuredClone(cue);
    bundle.cues.push(savedCue);
    bundle.manifest.cue_refs.push({ id: savedCue.id, revision: savedCue.revision });
    useProjectStore.setState({
      bundle,
      selectedCueRef: { id: savedCue.id, revision: savedCue.revision },
    });

    render(<Harness />);

    expect(screen.getByText("My Cues")).toBeTruthy();
    expect(screen.queryByText("Project Cues")).toBeNull();
    const deleteCue = await screen.findByRole("button", { name: "Delete Cue" });
    expect(deleteCue.className).toContain("h-7");
    fireEvent.click(deleteCue);
    expect(
      useProjectStore
        .getState()
        .bundle.cues.some(
          (candidate) => candidate.id === savedCue.id && candidate.revision === savedCue.revision,
        ),
    ).toBe(false);
    expect(useAuthoringDraftStore.getState().cue).toBeNull();
    expect(useProjectStore.getState().selectedCueRef).toBeNull();
  });

  it("confirms and atomically removes referenced CueClips when deleting a Cue", async () => {
    workspaceActions.setAdvancedMode(false);
    const state = useProjectStore.getState();
    const bundle = structuredClone(state.bundle);
    const savedCue = structuredClone(cue);
    const clipId = "referenced-cue-clip";
    const track = bundle.arrangements[0].tracks[0];
    const parameter = catalog.effects[0].parameters[0];
    bundle.cues.push(savedCue);
    bundle.manifest.cue_refs.push({ id: savedCue.id, revision: savedCue.revision });
    track.clips = [
      {
        id: clipId,
        cue_ref: { id: savedCue.id, revision: savedCue.revision },
        start_tick: 0,
        duration_tick: 3_840,
      },
    ];
    track.automation_lanes = [
      {
        id: "referenced-cue-lane",
        target: {
          scope: "cue_layer",
          clip_id: clipId,
          layer_id: savedCue.layers[0].id,
          parameter_id: parameter.id,
        },
        keyframes: [
          {
            id: "referenced-cue-keyframe",
            time_tick: 0,
            value: parameterInitialValue(parameter),
            interpolation: "linear",
          },
        ],
      },
    ];
    useProjectStore.setState({
      bundle,
      selectedCueRef: { id: savedCue.id, revision: savedCue.revision },
    });

    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete Cue" }));

    expect(screen.getByRole("dialog", { name: "Delete Cue and Arrangement clips?" })).toBeTruthy();
    expect(screen.getByText(/1 CueClip.*1 Arrangement/)).toBeTruthy();
    expect(
      useProjectStore.getState().bundle.cues.some((candidate) => candidate.id === savedCue.id),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Delete Cue and clips" }));

    let project = useProjectStore.getState();
    expect(project.bundle.cues.some((candidate) => candidate.id === savedCue.id)).toBe(false);
    expect(project.bundle.arrangements[0].tracks[0].clips).toHaveLength(0);
    expect(project.bundle.arrangements[0].tracks[0].automation_lanes).toHaveLength(0);
    expect(useAuthoringDraftStore.getState().cue).toBeNull();
    expect(project.selectedCueRef).toBeNull();

    act(() => projectActions.undo());
    project = useProjectStore.getState();
    expect(project.bundle.cues.some((candidate) => candidate.id === savedCue.id)).toBe(true);
    expect(project.bundle.arrangements[0].tracks[0].clips).toHaveLength(1);
    expect(project.bundle.arrangements[0].tracks[0].automation_lanes).toHaveLength(1);
  });

  it("keeps mute, solo, overrides, and automation local until one immutable save", async () => {
    const initialCueRefs = useProjectStore.getState().bundle.cues.map(assetKey);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Four on Floor.*1 effect/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Mute layer 2" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Mute layer 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Solo layer 1" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Add automation" })[0]);

    expect(useProjectStore.getState().bundle.cues.map(assetKey)).toEqual(initialCueRefs);
    expect(useAuthoringDraftStore.getState().cue).toMatchObject({
      mutedLayerIds: [cue.layers[1].id],
      soloLayerId: cue.layers[0].id,
    });
    expect(useAuthoringDraftStore.getState().cue?.working.automation_lanes).toHaveLength(1);

    const save = screen.getByRole("button", { name: "Save Cue" });
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
    fireEvent.click(save);

    const project = useProjectStore.getState();
    expect(project.bundle.cues).toHaveLength(initialCueRefs.length + 1);
    expect(project.bundle.effects.some((effect) => effect.id === catalog.effects[0].id)).toBe(true);
    expect(project.historyCursor).toBe(1);
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

  it("wraps advanced Cue actions and metadata inside a narrow inspector", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /Four on Floor.*1 effect/ }));
    await waitFor(() => expect(screen.getByText("Selected Effect")).toBeTruthy());

    const actionRows = document.querySelectorAll<HTMLElement>(
      '[data-layout-region="cue-override-actions"]',
    );
    const parameterHeaders = document.querySelectorAll<HTMLElement>(
      '[data-layout-region="effect-parameter-header"]',
    );
    const mixControls = document.querySelector<HTMLElement>(
      '[data-layout-region="cue-mix-controls"]',
    );

    expect(actionRows.length).toBeGreaterThan(0);
    expect(parameterHeaders.length).toBeGreaterThan(0);
    for (const row of [...actionRows, ...parameterHeaders]) {
      expect(row.className).toContain("min-w-0");
      expect(row.className).toContain("flex-wrap");
    }
    expect(mixControls?.className).toContain("grid-cols-[repeat(2,minmax(0,1fr))]");
    expect(screen.getAllByRole("button", { name: "Add automation" })[0]?.className).toContain(
      "max-w-full",
    );
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
  effect.parameters = effect.parameters.map((parameter) => ({
    ...parameter,
    scope: "arrangement",
    section: "main",
    help: parameter.name,
  }));
  scratch.effects.push(effect);
  const reference = { id: effect.id, revision: effect.revision };
  const cue = createCueAsset(scratch, [reference, reference], "Four on Floor");
  cue.id = "cue-four-on-floor";
  cue.layers[0].id = "kick-a";
  cue.layers[1].id = "kick-b";
  cue.layers[1].mix_overrides = [{ attribute_id: "intensity", policy: "htp" }];
  const catalog: ProductionCatalog = {
    schema_version: 1,
    layouts: [],
    arrangements: [],
    project_templates: [],
    effects: [effect satisfies EffectDefinitionDocument],
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
