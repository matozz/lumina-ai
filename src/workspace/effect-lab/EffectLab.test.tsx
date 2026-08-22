import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EffectDefinitionDocument,
  ProductionCatalog,
  ProjectBundle,
  TemporalAnalysisRequest,
} from "@/bridge/types";
import { createEffectAsset, exactAsset } from "@/document/projectModel";
import { authoringDraftActions, useAuthoringDraftStore } from "@/stores/authoringDraft";
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
  analyzeEffectTemporal: vi.fn(async (project: ProjectBundle, request: TemporalAnalysisRequest) => {
    const effect = project.effects.find(
      (candidate) =>
        candidate.id === request.effect_ref.id &&
        candidate.revision === request.effect_ref.revision,
    )!;
    const stage = project.stages.find(
      (candidate) =>
        candidate.id === project.manifest.stage_ref.id &&
        candidate.revision === project.manifest.stage_ref.revision,
    )!;
    return {
      schema_version: 1,
      cache_key: "test-temporal",
      behavior: effect.tempo,
      identity: {
        effect_ref: request.effect_ref,
        stage_ref: project.manifest.stage_ref,
        layout_ref: stage.layout_ref,
        target_set_id: request.target_set_id,
        target_fixture_count: 400,
        seed: request.seed,
        parameter_overrides: request.parameter_overrides ?? {},
        bpm: request.bpm,
        speeds: request.speeds,
        sampling: request.sampling,
      },
      fingerprints: request.speeds.map((speed) => ({
        speed,
        graph_cycles_per_beat: speed / effect.tempo.events_per_graph_cycle,
        primary_events_per_beat: speed,
        primary_events_per_second: (speed * request.bpm) / 60,
        sample_duration_beats: 4,
        sample_count: 257,
        intensity: { mean: 0.5, variance: 0.1, minimum: 0, maximum: 1 },
        active_fixture_fraction: { mean: 0.5, variance: 0.1, minimum: 0, maximum: 1 },
        frame_delta_change_energy: speed / 100,
        aliasing: {
          preview_fps: request.sampling.preview_fps,
          frames_per_primary_event: request.sampling.preview_fps / ((speed * request.bpm) / 60),
          risk: speed >= 8 ? "caution" : "none",
        },
      })),
    };
  }),
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
    bridge.analyzeEffectTemporal.mockClear();
  });

  it("separates read-only Production revisions from Project drafts", async () => {
    render(<EffectLabHarness />);

    expect(screen.getByText("Production Catalog")).toBeTruthy();
    expect(screen.getByText("My Effects")).toBeTruthy();
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
    act(() => projectActions.setSelectedTargetSetId("zone-2x2-1"));
    await waitFor(() =>
      expect(screen.getAllByText("2×2 · Top left · 100 of 400").length).toBeGreaterThan(0),
    );
    fireEvent.click(useInCue);
    fireEvent.click(await screen.findByRole("button", { name: "Use high-risk Effect" }));

    expect(useWorkspaceStore.getState().activeWorkspace).toBe("cues");
    expect(useProjectStore.getState().selectedCueRef).toBeTruthy();
    expect(useAuthoringDraftStore.getState().cue?.working.layers[0].target_set_ref).toMatchObject({
      target_set_id: "zone-2x2-1",
    });
  });

  it("starts on all Stage fixtures and opens the reusable fixture-area editor", async () => {
    workspaceActions.setAdvancedMode(false);
    projectActions.setSelectedTargetSetId("columns");
    render(<EffectLabHarness />);

    await waitFor(() => expect(useProjectStore.getState().selectedTargetSetId).toBe("all"));
    expect(screen.getByText("Previewing Main Stage")).toBeTruthy();
    expect(screen.getByText("All fixtures · 400")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit areas" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Fixture area editor")).toBeTruthy();
    expect(screen.getByRole("grid", { name: "TargetSet fixture preview" })).toBeTruthy();
  });

  it("disables Effects that the selected Stage fixtures cannot render", async () => {
    const catalog = productionCatalog();
    const pan = structuredClone(catalog.effects[0]);
    pan.id = "builtin.movement.pan-sweep";
    pan.name = "Pan Sweep";
    pan.catalog.family = "movement";
    pan.catalog.required_attributes = ["position.pan", "intensity"];
    productionCatalogActions.setCatalog({ ...catalog, effects: [...catalog.effects, pan] });

    render(<EffectLabHarness />);

    const unavailable = await screen.findByRole("button", {
      name: /Pan Sweep.*Needs pan movement/,
    });
    expect(unavailable.hasAttribute("disabled")).toBe(true);
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
    const fastestSpeed = screen.getByRole("option", {
      name: /8× · 8 onset\/beat · 17\.07 events\/s/,
    });
    fireEvent.mouseMove(fastestSpeed);
    fireEvent.click(fastestSpeed);

    const save = screen.getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
    fireEvent.click(save);

    const state = useProjectStore.getState();
    const next = exactAsset(state.bundle.effects, state.selectedEffectRef);
    expect(next?.revision).toBe(2);
    expect(next?.parameters.find((parameter) => parameter.id === "speed")?.schema).toMatchObject({
      type: "scalar",
      default: 8,
    });
    expect(exactAsset(state.bundle.effects, original)?.revision).toBe(1);
  });

  it("shows only the current analysis while keeping every beat-synced speed available", async () => {
    workspaceActions.setAdvancedMode(false);
    projectActions.createEffect("Pulse");
    render(<EffectLabHarness />);

    await waitFor(() => expect(bridge.analyzeEffectTemporal).toHaveBeenCalled());
    let analysisCalls = bridge.analyzeEffectTemporal.mock.calls;
    expect(analysisCalls[analysisCalls.length - 1]?.[1]).toMatchObject({
      seed: "effec7ab00000001",
      speeds: [1],
    });
    const currentAnalysis = screen.getByLabelText("Current temporal analysis");
    expect(currentAnalysis.textContent).toContain("Current behavior");
    expect(currentAnalysis.textContent).toContain("1 onset/beat · 2.13 events/s");
    expect(screen.queryByText("Runtime analyzed")).toBeNull();
    expect(screen.queryByLabelText("Measured speed comparison")).toBeNull();

    fireEvent.click(screen.getByLabelText("Speed"));
    for (const speed of ["0.25×", "0.5×", "1×", "2×", "4×", "8×"]) {
      expect(
        screen.getByRole("option", { name: new RegExp(`^${speed.replace(".", "\\.")}`) }),
      ).toBeTruthy();
    }
    const eightSpeed = screen.getByRole("option", {
      name: /8× · 8 onset\/beat · 17\.07 events\/s/,
    });
    fireEvent.mouseMove(eightSpeed);
    fireEvent.click(eightSpeed);

    await waitFor(() => {
      analysisCalls = bridge.analyzeEffectTemporal.mock.calls;
      expect(analysisCalls[analysisCalls.length - 1]?.[1].speeds).toEqual([8]);
      expect(currentAnalysis.textContent).toContain("8 onset/beat · 17.07 events/s");
    });
    expect(screen.queryByText("High-speed readability is limited")).toBeNull();
    expect(screen.queryByText("High-speed preview is undersampled")).toBeNull();
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
  return {
    schema_version: 1,
    effects: [pulse, gradient],
    cue_recipes: [],
    layouts: [],
    arrangements: [],
    project_templates: [],
  };
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
  return effect;
}
