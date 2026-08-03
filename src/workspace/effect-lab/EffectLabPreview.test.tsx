import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FixtureFramePayload } from "@/bridge/types";
import { engineActions } from "@/stores/engine";
import { workspaceActions } from "@/stores/workspace";
import { createStarterProject } from "../defaultProject";
import { createEffectPair, effectFormValues, reviseEffectPair } from "./effectFactory";
import { EffectLabPreview } from "./EffectLabPreview";

const commandMocks = vi.hoisted(() => ({
  previewEffectLoop: vi.fn(),
}));

vi.mock("@/bridge/commands", () => ({ engine: commandMocks }));
vi.mock("@/canvas/CanvasView", () => ({ CanvasView: () => <div data-testid="canvas" /> }));

describe("EffectLabPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    workspaceActions.reset();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("compiles one loop once, scrubs it, and compares consecutive revisions", async () => {
    const document = createStarterProject();
    const pair = createEffectPair(document);
    document.effect_definitions.push(pair.definition);
    document.effect_instances.push(pair.instance);
    engineActions.loadCurrentDslCode(JSON.stringify(document));
    workspaceActions.setSelectedEffectId(pair.definition.id);
    const frame: FixtureFramePayload[] = [
      {
        id: 1,
        profile_id: "generic-rgb",
        attributes: [
          { id: "intensity", value: { type: "scalar", value: 1 } },
          { id: "color.rgb", value: { type: "color", value: [255, 0, 0] } },
        ],
      },
    ];
    const nextFrame: FixtureFramePayload[] = [
      {
        ...frame[0],
        attributes: [
          { id: "intensity", value: { type: "scalar", value: 0.25 } },
          { id: "color.rgb", value: { type: "color", value: [0, 0, 255] } },
        ],
      },
    ];
    commandMocks.previewEffectLoop
      .mockResolvedValueOnce([frame])
      .mockResolvedValueOnce([nextFrame]);
    const onFrame = vi.fn();
    window.addEventListener("workspace:test-fixtures", onFrame);

    render(<EffectLabPreview />);

    await waitFor(() => expect(commandMocks.previewEffectLoop).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(onFrame).toHaveBeenCalledWith(expect.objectContaining({ detail: frame })),
    );
    const revised = reviseEffectPair(pair.definition, pair.instance, {
      ...effectFormValues(pair.definition, pair.instance),
      color: "#0000ff",
    });
    engineActions.applyDocumentTransaction({
      id: "preview-r2",
      label: "Preview r2",
      commands: [
        {
          type: "revise_effect",
          definition_id: pair.definition.id,
          definition: revised.definition,
          primary_instance: revised.instance,
        },
      ],
    });
    await waitFor(() => expect(commandMocks.previewEffectLoop).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect((screen.getByLabelText("Preview revision A") as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );

    onFrame.mockClear();
    fireEvent.input(screen.getByLabelText("Scrub effect loop"), { target: { value: "0" } });
    fireEvent.click(screen.getByLabelText("Preview revision A"));
    expect(onFrame).toHaveBeenLastCalledWith(expect.objectContaining({ detail: frame }));
    fireEvent.click(screen.getByLabelText("Preview revision B"));
    expect(onFrame).toHaveBeenLastCalledWith(expect.objectContaining({ detail: nextFrame }));
    window.removeEventListener("workspace:test-fixtures", onFrame);
  });
});
