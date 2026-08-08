import { describe, expect, it } from "vitest";

import { builtinLayouts } from "@/catalog/builtinCatalog";
import generatorGolden from "../../catalog/builtin/generators/golden-v1.json";
import { fixtureIdsForLayout, layoutPositions } from "./layoutDefinition";
import { generatorDescriptor, generatorRegistry } from "./generatorRegistry";

describe("Generator Registry V1", () => {
  it("declares every formal, read-only, and unavailable generator once", () => {
    expect(generatorRegistry.size).toBe(12);
    for (const shape of [
      "matrix",
      "wall",
      "strip",
      "frame",
      "circle",
      "sector",
      "polygon",
      "honeycomb",
      "formula",
      "algorithm",
    ] as const) {
      const descriptor = generatorDescriptor(shape);
      expect(descriptor.status).toBe("supported");
      expect(descriptor.preview).toEqual({ mode: "full_geometry", auto_fit: true });
      expect(descriptor.coordinate_model).not.toBe("");
      expect(descriptor.validation_model).not.toBe("");
      expect(descriptor.parameter_schema.some((parameter) => parameter.role === "quantity")).toBe(
        true,
      );
    }
    expect(generatorDescriptor("custom").status).toBe("unavailable");
    expect(generatorDescriptor("svg_path").status).toBe("read_only");
  });

  it("matches the Rust capacity and coordinate golden for every built-in Layout", () => {
    const actual = builtinLayouts.map((layout) => {
      const positions = layoutPositions(layout, fixtureIdsForLayout(layout));
      const sampleIndices = [
        0,
        Math.floor(positions.length / 2),
        Math.max(0, positions.length - 1),
      ];
      return {
        id: layout.id,
        shape: layout.geometry.shape,
        capacity: positions.length,
        samples: sampleIndices.flatMap((index) => {
          const position = positions[index];
          return position
            ? [
                {
                  id: position.id,
                  x: roundSix(position.x),
                  y: roundSix(position.y),
                },
              ]
            : [];
        }),
      };
    });
    expect({ schema_version: 1, layouts: actual }).toEqual(generatorGolden);
  });
});

function roundSix(value: number) {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
