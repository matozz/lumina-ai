import { describe, expect, it } from "vitest";
import { builtinEffects } from "./builtinCatalog";

const EXPLICIT_DEFAULT_COLOR_EFFECT_IDS = [
  "builtin.spatial.radial-bloom",
  "builtin.transition.blackout-safe",
  "builtin.transition.fade-crossfade",
];

describe("Production Color overrides", () => {
  it("pins one complete standard Color contract on every built-in Effect", () => {
    for (const effect of builtinEffects) {
      const colors = effect.parameters.filter((parameter) => parameter.id === "color");
      expect(colors, effect.id).toHaveLength(1);
      expect(colors[0], effect.id).toMatchObject({
        id: "color",
        schema: { type: "color" },
        scope: "arrangement",
        section: "main",
      });
      expect(colors[0].help, effect.id).toBeTruthy();
    }
  });

  it("preserves authored defaults only for Effects that previously enabled Color", () => {
    for (const effect of builtinEffects) {
      const color = effect.parameters.find((parameter) => parameter.id === "color")!;
      const expectsDefault = EXPLICIT_DEFAULT_COLOR_EFFECT_IDS.includes(effect.id);
      expect("default" in color.schema, effect.id).toBe(expectsDefault);
    }
  });

  it("keeps structural Palette stops Effect-only and non-automatable", () => {
    const pulse = builtinEffects.find(
      (effect) => effect.id === "builtin.color.pulse" && effect.revision === 1,
    )!;
    expect(
      pulse.parameters.find((parameter) => parameter.schema.type === "color_stops"),
    ).toMatchObject({ scope: "effect", section: "advanced" });
  });
});
