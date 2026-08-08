import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authoringSessionKey,
  authoringTransportActions,
  useAuthoringTransportStore,
} from "@/authoring/transport";
import type { PreviewSource, RenderContext } from "@/bridge/types";
import { assetKey } from "@/document/projectModel";
import { projectActions, useProjectStore } from "@/stores/project";
import type { WorkspaceId } from "@/stores/workspace";
import { useProjectPreviewController } from "./useProjectPreviewController";

const commandMocks = vi.hoisted(() => ({
  previewProject: vi.fn(),
  renderProjectPreview: vi.fn(),
}));

vi.mock("@/bridge/commands", () => ({ engine: commandMocks }));

function Harness({ workspace }: { workspace: WorkspaceId }) {
  useProjectPreviewController(workspace);
  return null;
}

describe("PreviewSession boundary state machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    projectActions.reset();
    commandMocks.previewProject.mockImplementation(
      (options: { source: PreviewSource; context: RenderContext; playheadTick: number }) =>
        Promise.resolve(frame(options.source, options.context, options.playheadTick)),
    );
    commandMocks.renderProjectPreview.mockImplementation(
      (context: RenderContext, playheadTick: number) =>
        Promise.resolve(frame({ type: "authoring_draft" }, context, playheadTick)),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("preserves authoring state while isolating Draft, Published rehearsal, and Live", async () => {
    const effect = projectActions.createEffect("Pulse")!;
    const cue = projectActions.createCue([effect], "Pulse Cue")!;
    const effectSessionKey = authoringSessionKey("effect", assetKey(effect));
    authoringTransportActions.ensureSession({
      key: effectSessionKey,
      scope: "effect",
      durationTicks: 3_840,
    });
    authoringTransportActions.seek(effectSessionKey, 1_234);

    const view = render(<Harness workspace="effect-lab" />);
    await waitFor(() => expect(commandMocks.previewProject).toHaveBeenCalledOnce());
    expect(commandMocks.previewProject).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: { type: "authoring_draft" },
        context: { type: "effect", effect_ref: effect, target_set_id: "all" },
        playheadTick: 1_234,
      }),
    );

    view.rerender(<Harness workspace="cues" />);
    await waitFor(() =>
      expect(commandMocks.previewProject).toHaveBeenLastCalledWith(
        expect.objectContaining({ context: { type: "cue", cue_ref: cue }, playheadTick: 0 }),
      ),
    );
    expect(useAuthoringTransportStore.getState().sessions[effectSessionKey].cursorTick).toBe(1_234);
    expect(useProjectStore.getState().selectedEffectRef).toEqual(effect);

    const previewCallsBeforeLive = commandMocks.previewProject.mock.calls.length;
    const renderCallsBeforeLive = commandMocks.renderProjectPreview.mock.calls.length;
    view.rerender(<Harness workspace="live" />);
    await Promise.resolve();
    expect(commandMocks.previewProject).toHaveBeenCalledTimes(previewCallsBeforeLive);
    expect(commandMocks.renderProjectPreview).toHaveBeenCalledTimes(renderCallsBeforeLive);

    act(() => {
      projectActions.setPreviewSource("rehearsal_draft");
      projectActions.setLiveViewMode("rehearsal");
    });
    view.rerender(<Harness workspace="live" />);
    await waitFor(() =>
      expect(commandMocks.previewProject).toHaveBeenLastCalledWith(
        expect.objectContaining({ source: { type: "rehearsal_draft" } }),
      ),
    );

    act(() => projectActions.setPreviewSource("rehearsal_published", 42));
    view.rerender(<Harness workspace="live" />);
    await waitFor(() =>
      expect(commandMocks.previewProject).toHaveBeenLastCalledWith(
        expect.objectContaining({
          project: undefined,
          arrangementRef: undefined,
          source: { type: "rehearsal_published", revision: 42 },
          context: { type: "arrangement" },
        }),
      ),
    );
  });

  it("does not compile or publish Effect output for the Stage layout surface", async () => {
    render(<Harness workspace="stage" />);

    await Promise.resolve();
    expect(commandMocks.previewProject).not.toHaveBeenCalled();
    expect(commandMocks.renderProjectPreview).not.toHaveBeenCalled();
  });

  it("continues Cue playback when the selected Cue changes inside Cues", async () => {
    const effect = projectActions.createEffect("Sweep")!;
    const first = projectActions.createCue([effect], "First Cue")!;
    const second = projectActions.createCue([effect], "Second Cue")!;
    projectActions.setSelectedCueRef(first);
    const firstKey = authoringSessionKey("cue", assetKey(first));
    authoringTransportActions.ensureSession({
      key: firstKey,
      scope: "cue",
      durationTicks: 3_840,
    });
    authoringTransportActions.seek(firstKey, 1_920, 10);
    authoringTransportActions.play(firstKey, 20);
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<Harness workspace="cues" />);
    await waitFor(() => expect(commandMocks.previewProject).toHaveBeenCalledOnce());

    act(() => projectActions.setSelectedCueRef(second));

    const secondKey = authoringSessionKey("cue", assetKey(second));
    await waitFor(() =>
      expect(useAuthoringTransportStore.getState().sessions[secondKey]).toMatchObject({
        playback: "playing",
      }),
    );
    expect(useAuthoringTransportStore.getState().sessions[secondKey].cursorTick).toBe(1_920);
  });
});

function frame(source: PreviewSource, context: RenderContext, playheadTick: number) {
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
