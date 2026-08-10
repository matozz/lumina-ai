import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { KeyframeDSL, ParameterDefinitionDSL } from "@/bridge/types";
import {
  AutomationCurveSegment,
  automationCurveGeometry,
  curvePath,
  updateAutomationCurveElement,
} from "./AutomationCurveSegment";

const definition: ParameterDefinitionDSL = {
  id: "intensity",
  name: "Intensity",
  schema: {
    type: "scalar",
    default: 0.5,
    range: { min: 0, max: 1, step: 0.01 },
    unit: "normalized",
  },
  scope: "arrangement",
  section: "main",
  help: "Output intensity.",
};

const start: KeyframeDSL = {
  id: "start",
  time_tick: 960,
  value: { type: "scalar", value: 0.75 },
  interpolation: "linear",
};
const end: KeyframeDSL = {
  id: "end",
  time_tick: 1_920,
  value: { type: "scalar", value: 0.25 },
  interpolation: "linear",
};

describe("AutomationCurveSegment", () => {
  it("projects curve endpoints from the exact same tick geometry as keyframe centers", () => {
    const { container } = render(
      <AutomationCurveSegment
        start={start}
        end={end}
        definition={definition}
        ppq={960}
        beatWidth={48}
        height={32}
        valueInset={6}
      />,
    );
    const curve = container.querySelector<SVGSVGElement>("[data-automation-curve]")!;

    updateAutomationCurveElement(
      curve,
      start,
      end,
      definition,
      960,
      48,
      32,
      6,
      new Set([start.id]),
      240,
    );

    const projected = automationCurveGeometry(
      { ...start, time_tick: 1_200 },
      end,
      definition,
      960,
      48,
      32,
      6,
    );
    expect(Number.parseFloat(curve.style.left)).toBe(projected.left);
    expect(Number.parseFloat(curve.style.width)).toBe(projected.width);
    expect(projected.left).toBeCloseTo((1_200 / 960) * 48, 8);
    expect(projected.left + projected.width).toBeCloseTo((1_920 / 960) * 48, 8);
  });

  it("holds the previous value through the boundary and jumps at the next point", () => {
    expect(curvePath("hold", 48, 7, 25)).toBe("M 0 7 H 48 V 25");
    expect(curvePath("hold", 48, 7, 25)).not.toContain("47");
  });

  it("renders Color as a centered endpoint gradient band instead of scalar height", () => {
    const colorDefinition: ParameterDefinitionDSL = {
      ...definition,
      id: "color",
      name: "Color",
      schema: { type: "color", default: "#FF0000" },
    };
    const { container } = render(
      <AutomationCurveSegment
        start={{ ...start, value: { type: "color", value: "#FF0000" } }}
        end={{ ...end, value: { type: "color", value: "#0000FF" } }}
        definition={colorDefinition}
        ppq={960}
        beatWidth={48}
        height={32}
        valueInset={6}
      />,
    );

    const band = container.querySelector<SVGRectElement>("[data-automation-color-band]")!;
    const stops = [...container.querySelectorAll("stop")];
    expect(band.getAttribute("y")).toBe("11");
    expect(band.getAttribute("height")).toBe("10");
    expect(stops.map((stop) => stop.getAttribute("stop-color"))).toEqual(["#FF0000", "#0000FF"]);
    expect(container.querySelector("path")).toBeNull();
  });
});
