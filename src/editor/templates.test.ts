import { describe, expect, it } from "vitest";
import { validateShowDocument } from "@/document/showDocument";
import { getTemplates } from "./templates";

describe("DSL template contract", () => {
  it("loads all 18 templates through the frontend runtime schema", () => {
    const templates = getTemplates();

    expect(templates).toHaveLength(18);
    expect(templates.map((template) => template.key).sort()).toEqual([
      "breathe",
      "chaos",
      "circle",
      "color_bump",
      "combined",
      "heart",
      "lissajous",
      "matrix",
      "matrix_grouped",
      "matrix_target",
      "matrix_wall",
      "pixel_chase",
      "pulse_engine",
      "pyramid_stage",
      "rainbow_wave",
      "sine_wave",
      "spiral",
      "zigzag",
    ]);

    for (const template of templates) {
      expect(template.disabled, template.errorMessage).not.toBe(true);
      const parsed = validateShowDocument(JSON.parse(template.dsl));
      expect(parsed.success, `${template.key} must satisfy ShowDocumentV3`).toBe(true);
      if (parsed.success) {
        expect(parsed.data.schema_version).toBe(3);
      }
    }
  });
});
