import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createCueAsset, createEffectAsset } from "@/document/projectModel";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
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
});
