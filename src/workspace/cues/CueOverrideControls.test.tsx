import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createCueAsset, createEffectAsset } from "@/document/projectModel";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import type { CueLayerUpdate } from "./cueAuthoring";
import { CueOverrideControls } from "./CueOverrideControls";

describe("CueOverrideControls Color", () => {
  it("edits the typed single-color override without touching Layer identity", () => {
    const bundle = createStarterProjectBundle();
    const effect = createEffectAsset(bundle, "Color-capable Pulse");
    bundle.effects.push(effect);
    const cue = createCueAsset(bundle, [effect]);
    const layer = cue.layers[0];
    const layerId = layer.id;

    render(
      <CueOverrideControls
        cue={cue}
        layer={layer}
        effect={effect}
        advanced
        onUpdate={(update) => update(layer, cue)}
      />,
    );

    const picker = screen.getByLabelText("Color color picker");
    const value = screen.getByLabelText("Color color value");
    expect(picker).toHaveProperty("type", "color");
    fireEvent.change(value, { target: { value: "#12ABEF" } });
    expect(layer.parameter_overrides?.color).toEqual({ type: "color", value: "#12ABEF" });
    expect(layer.id).toBe(layerId);
  });

  it("adds and clears an optional Color override while preserving the Effect fallback", () => {
    const bundle = createStarterProjectBundle();
    const effect = createEffectAsset(bundle, "Intensity-only Pulse");
    const color = effect.parameters.find((parameter) => parameter.id === "color")!;
    if (color.schema.type !== "color") throw new Error("standard Color parameter missing");
    delete color.schema.default;
    const cue = createCueAsset(bundle, [effect]);
    const layer = cue.layers[0];
    const onUpdate = (update: CueLayerUpdate) => update(layer, cue);
    const { rerender } = render(
      <CueOverrideControls
        cue={cue}
        layer={layer}
        effect={effect}
        advanced={false}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.queryByLabelText("Color color picker")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose color" }));
    expect(layer.parameter_overrides?.color).toEqual({ type: "color", value: "#FFFFFF" });

    rerender(
      <CueOverrideControls
        cue={cue}
        layer={layer}
        effect={effect}
        advanced={false}
        onUpdate={onUpdate}
      />,
    );
    expect(screen.getByLabelText("Color color picker")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear Color color" }));
    expect(layer.parameter_overrides?.color).toBeUndefined();

    rerender(
      <CueOverrideControls
        cue={cue}
        layer={layer}
        effect={effect}
        advanced={false}
        onUpdate={onUpdate}
      />,
    );
    expect(screen.queryByLabelText("Color color picker")).toBeNull();
    expect(screen.getByText("Use Effect color")).toBeTruthy();
  });
});
