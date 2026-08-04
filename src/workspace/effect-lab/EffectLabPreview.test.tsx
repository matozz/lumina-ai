import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectActions, useProjectStore } from "@/stores/project";
import { useProjectPreviewController } from "../useProjectPreviewController";
import { EffectLabPreview } from "./EffectLabPreview";

const commandMocks = vi.hoisted(() => ({
  previewProject: vi.fn(),
  renderProjectPreview: vi.fn(),
}));

vi.mock("@/bridge/commands", () => ({ engine: commandMocks }));
vi.mock("@/canvas/CanvasView", () => ({ CanvasView: () => <div data-testid="canvas" /> }));

function Harness() {
  useProjectPreviewController("effect-lab");
  return <EffectLabPreview />;
}

describe("EffectLabPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    projectActions.reset();
    projectActions.setEffectPreviewPlayback("paused");
  });

  it("previews the selected Effect Draft through an isolated Authoring Preview session", async () => {
    const reference = projectActions.createEffect("Pulse")!;
    const bundle = useProjectStore.getState().bundle;
    commandMocks.previewProject.mockResolvedValue({
      generation: 1,
      source: { type: "authoring_draft" },
      context: { type: "effect", effect_ref: reference, target_set_id: "all" },
      project_ref: { id: bundle.manifest.project_id, revision: bundle.manifest.revision },
      stage_ref: bundle.manifest.stage_ref,
      arrangement_ref: useProjectStore.getState().selectedArrangementRef,
      playhead_tick: 0,
      layout_coords: [],
      outputs: [],
    });

    render(<Harness />);

    await waitFor(() => expect(commandMocks.previewProject).toHaveBeenCalledOnce());
    expect(commandMocks.previewProject).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { type: "authoring_draft" },
        context: { type: "effect", effect_ref: reference, target_set_id: "all" },
        playheadTick: 0,
      }),
    );
    expect(useProjectStore.getState().previewGeneration).toBe(1);
  });

  it("switches to a newly created Effect while playing without a tick-driven restart loop", async () => {
    const pulse = projectActions.createEffect("Pulse")!;
    projectActions.setEffectPreviewPlayback("playing");
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    commandMocks.previewProject.mockImplementation(
      (options: { source: { type: "authoring_draft" }; context: object; playheadTick: number }) =>
        Promise.resolve(previewFrame(options.source, options.context, options.playheadTick)),
    );
    commandMocks.renderProjectPreview.mockResolvedValue(
      previewFrame(
        { type: "authoring_draft" },
        { type: "effect", effect_ref: pulse, target_set_id: "all" },
        0,
      ),
    );
    render(<Harness />);
    await waitFor(() => expect(commandMocks.previewProject).toHaveBeenCalledOnce());

    act(() => {
      projectActions.createEffect("Gradient");
    });

    await waitFor(() => expect(commandMocks.previewProject).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Gradient · r1")).toBeTruthy();
  });
});

function previewFrame(source: object, context: object, playheadTick: number) {
  const state = useProjectStore.getState();
  return {
    generation: 1,
    source,
    context,
    project_ref: {
      id: state.bundle.manifest.project_id,
      revision: state.bundle.manifest.revision,
    },
    stage_ref: state.bundle.manifest.stage_ref,
    arrangement_ref: state.selectedArrangementRef,
    playhead_tick: playheadTick,
    layout_coords: [],
    outputs: [],
  };
}
