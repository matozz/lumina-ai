import { describe, expect, it } from "vitest";
import { activeLayout, activeStage, createEffectAsset } from "./projectModel";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { effectTargetCompatibility } from "./effectCompatibility";

describe("effectTargetCompatibility", () => {
  it("accepts intensity effects on Generic RGB fixture areas", () => {
    const bundle = createStarterProjectBundle();
    const stage = activeStage(bundle);
    const effect = createEffectAsset(bundle, "Pulse");

    expect(
      effectTargetCompatibility(stage, activeLayout(bundle), stage.target_sets[0], effect),
    ).toMatchObject({ compatible: true, fixtureCount: 80, missingAttributes: [] });
  });

  it("explains movement attributes missing from Generic RGB fixtures", () => {
    const bundle = createStarterProjectBundle();
    const stage = activeStage(bundle);
    const effect = createEffectAsset(bundle, "Pan Sweep");
    effect.catalog.required_attributes = ["position.pan", "intensity"];

    expect(
      effectTargetCompatibility(stage, activeLayout(bundle), stage.target_sets[0], effect),
    ).toMatchObject({ compatible: false, missingAttributes: ["position.pan"] });
  });
});
