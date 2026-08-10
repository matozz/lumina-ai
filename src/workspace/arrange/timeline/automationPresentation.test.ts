import { describe, expect, it } from "vitest";
import { createCueAsset, createEffectAsset } from "@/document/projectModel";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { arrangementAutomationDisplayLabel } from "./automationPresentation";

describe("Arrangement automation presentation", () => {
  it("uses a concise single-layer label and resolves names dynamically", () => {
    const bundle = createStarterProjectBundle();
    const effect = createEffectAsset(bundle, "Pulse Effect");
    bundle.effects.push(effect);
    const cue = createCueAsset(bundle, [effect], "Pulse Cue");
    bundle.cues.push(cue);
    const layerId = cue.layers[0].id;

    expect(arrangementAutomationDisplayLabel(bundle, cue, layerId, "Intensity")).toBe(
      "Pulse Cue · Intensity",
    );

    cue.name = "Renamed Cue";
    effect.name = "Renamed Effect";
    bundle.stages[0].target_sets[0].name = "Renamed Stage Target";
    expect(arrangementAutomationDisplayLabel(bundle, cue, layerId, "Intensity")).toBe(
      "Renamed Cue · Intensity",
    );
    expect(cue.layers[0].id).toBe(layerId);
  });

  it("disambiguates multiple layers with TargetSet, Effect, then stable Layer N", () => {
    const bundle = createStarterProjectBundle();
    const first = createEffectAsset(bundle, "Pulse");
    const second = createEffectAsset(bundle, "Pulse");
    second.name = first.name;
    bundle.effects.push(first, second);
    const cue = createCueAsset(bundle, [first, second], "Layered Cue");
    cue.layers[1].target_set_ref = structuredClone(cue.layers[0].target_set_ref);
    bundle.cues.push(cue);

    expect(arrangementAutomationDisplayLabel(bundle, cue, cue.layers[0].id, "Intensity")).toBe(
      "Layered Cue · All · Pulse · Layer 1 · Intensity",
    );
    expect(arrangementAutomationDisplayLabel(bundle, cue, cue.layers[1].id, "Intensity")).toBe(
      "Layered Cue · All · Pulse · Layer 2 · Intensity",
    );
  });
});
