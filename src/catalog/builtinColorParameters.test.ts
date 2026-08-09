import { describe, expect, it } from "vitest";
import { builtinEffects } from "./builtinCatalog";

const COLOR_EFFECT_IDS = [
  "builtin.color.pulse",
  "builtin.spatial.radial-bloom",
  "builtin.transition.blackout-safe",
  "builtin.transition.fade-crossfade",
];

describe("Production Color overrides", () => {
  it.each(COLOR_EFFECT_IDS)("pins a complete standard Color contract on %s", (id) => {
    const matchingEffects = builtinEffects.filter((effect) => effect.id === id);
    const effect = matchingEffects[0];
    const color = effect?.parameters.find((parameter) => parameter.id === "color");

    expect(matchingEffects).toHaveLength(1);
    expect(effect?.revision).toBe(1);
    expect(color).toMatchObject({
      id: "color",
      value_type: "color",
      required: true,
      override_policy: "cue_override",
      advanced: false,
      unit: "color",
      ui_hint: "color",
      automation: "continuous",
    });
    expect(color?.help).toBeTruthy();
    expect(color?.safe_fallback).toEqual({ type: "color", value: "#FFFFFF" });
    expect(effect?.catalog.required_attributes).toContain("color.rgb");
    expect(effect?.catalog.parameter_summary).toContain("color");
  });

  it("keeps structural Palette stops Effect-only and non-automatable", () => {
    const pulse = builtinEffects.find(
      (effect) => effect.id === "builtin.color.pulse" && effect.revision === 1,
    )!;
    expect(
      pulse.parameters.find((parameter) => parameter.value_type === "color_stops"),
    ).toMatchObject({ override_policy: "effect_only", automation: "disabled" });
  });
});
