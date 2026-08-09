import { describe, expect, it } from "vitest";
import { isOpaqueCueLayerId } from "@/document/cueLayerIdentity";
import { activeStage, createCueAsset, createEffectAsset } from "@/document/projectModel";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { appendCueLayer, duplicateCueLayer } from "./cueAuthoring";

describe("Cue Layer authoring identity", () => {
  it("allocates a new opaque identity when a Layer is appended", () => {
    const bundle = createStarterProjectBundle();
    const effect = createEffectAsset(bundle, "Center Pulse");
    bundle.effects.push(effect);
    const cue = createCueAsset(bundle, [effect]);

    const layerId = appendCueLayer(cue, effect, activeStage(bundle));

    expect(isOpaqueCueLayerId(layerId)).toBe(true);
    expect(layerId).not.toBe(cue.layers[0].id);
    expect(layerId).not.toMatch(/center|pulse|effect|target/i);
  });

  it("duplicates a Layer with a fresh identity and atomically remaps its Cue automation", () => {
    const bundle = createStarterProjectBundle();
    const effect = createEffectAsset(bundle, "Pulse");
    bundle.effects.push(effect);
    const cue = createCueAsset(bundle, [effect]);
    const sourceId = cue.layers[0].id;
    cue.automation_lanes = [
      {
        id: "source-intensity",
        target: { layer_id: sourceId, parameter_id: "intensity" },
        keyframes: [
          {
            id: "source-keyframe",
            time_tick: 0,
            value: { type: "scalar", value: 0.5 },
            interpolation: "linear",
          },
        ],
      },
    ];

    const copiedId = duplicateCueLayer(cue, sourceId);

    expect(copiedId).not.toBeNull();
    expect(isOpaqueCueLayerId(copiedId!)).toBe(true);
    expect(copiedId).not.toBe(sourceId);
    expect(cue.automation_lanes).toHaveLength(2);
    expect(cue.automation_lanes?.[0].target.layer_id).toBe(sourceId);
    expect(cue.automation_lanes?.[1].target.layer_id).toBe(copiedId);
    expect(cue.automation_lanes?.[1].keyframes).toEqual(cue.automation_lanes?.[0].keyframes);
  });
});
