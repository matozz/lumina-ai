import { describe, expect, it } from "vitest";
import type { ParameterDefinitionDSL } from "@/bridge/types";
import {
  parameterAllowsAutomation,
  parameterAllowsCueOverride,
  parameterAutomation,
  parameterDefaultValue,
  parameterEnumValues,
  parameterInitialValue,
  parameterRange,
  parameterStep,
  parameterUnit,
  parameterValueType,
  setParameterDefaultValue,
} from "./effectParameter";

describe("Effect parameter contract", () => {
  it("represents Color fallback by omitting schema.default", () => {
    const color = parameter({ schema: { type: "color" }, scope: "arrangement" });

    expect(parameterValueType(color)).toBe("color");
    expect(parameterDefaultValue(color)).toBeUndefined();
    expect(parameterInitialValue(color)).toEqual({ type: "color", value: "#FFFFFF" });

    setParameterDefaultValue(color, { type: "color", value: "#FF4FD8" });
    expect(parameterDefaultValue(color)).toEqual({ type: "color", value: "#FF4FD8" });
    setParameterDefaultValue(color, undefined);
    expect(color.schema).toEqual({ type: "color" });
  });

  it("derives override and automation from the maximum authoring scope", () => {
    const arrangementScalar = parameter({
      schema: {
        type: "scalar",
        default: 1,
        range: { min: 0.25, max: 8, step: 0.25 },
        unit: "multiplier",
      },
      scope: "arrangement",
    });
    const arrangementEnum = parameter({
      schema: { type: "enum", default: "sine", values: ["sine", "pulse"] },
      scope: "arrangement",
    });
    const cueBoolean = parameter({
      schema: { type: "boolean", default: false },
      scope: "cue",
    });
    const palette = parameter({
      schema: {
        type: "color_stops",
        default: [
          { position: 0, color: "#000000" },
          { position: 1, color: "#FFFFFF" },
        ],
      },
      scope: "effect",
    });

    expect(parameterAutomation(arrangementScalar)).toBe("continuous");
    expect(parameterAutomation(arrangementEnum)).toBe("discrete");
    expect(parameterAutomation(cueBoolean)).toBe("disabled");
    expect(parameterAutomation(palette)).toBe("disabled");
    expect(parameterAllowsCueOverride(arrangementScalar)).toBe(true);
    expect(parameterAllowsCueOverride(cueBoolean)).toBe(true);
    expect(parameterAllowsCueOverride(palette)).toBe(false);
    expect(parameterAllowsAutomation(arrangementEnum)).toBe(true);
  });

  it("keeps type-specific scalar and enum metadata inside schema", () => {
    const speed = parameter({
      schema: {
        type: "scalar",
        default: 1,
        range: { min: 0.25, max: 8, step: 0.25 },
        unit: "multiplier",
      },
      scope: "arrangement",
    });
    const waveform = parameter({
      schema: { type: "enum", default: "sine", values: ["sine", "triangle"] },
      scope: "effect",
    });

    expect(parameterRange(speed)).toEqual([0.25, 8]);
    expect(parameterStep(speed)).toBe(0.25);
    expect(parameterUnit(speed)).toBe("multiplier");
    expect(parameterEnumValues(waveform)).toEqual(["sine", "triangle"]);
  });
});

function parameter({
  schema,
  scope,
}: Pick<ParameterDefinitionDSL, "schema" | "scope">): ParameterDefinitionDSL {
  return {
    id: "parameter",
    name: "Parameter",
    schema,
    scope,
    section: "main",
    help: "Test parameter.",
  };
}
