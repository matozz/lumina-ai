import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ParameterDefinitionDSL } from "@/bridge/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AutomationKeyframeInspector } from "./AutomationKeyframeInspector";

const masterDimmer: ParameterDefinitionDSL = {
  id: "master_dimmer",
  name: "Master dimmer",
  value_type: "scalar",
  default_value: { type: "scalar", value: 1 },
  range: [0, 1],
  unit: "percent",
  ui_hint: "slider",
  automation: "continuous",
};

function renderInspector(definition: ParameterDefinitionDSL, onApply = vi.fn()) {
  render(
    <Popover open>
      <PopoverTrigger render={<button>Keyframe</button>} />
      <PopoverContent>
        <AutomationKeyframeInspector
          canDelete
          definition={definition}
          keyframe={{
            id: "key-0",
            time_tick: 0,
            value: definition.default_value,
            interpolation: definition.automation === "discrete" ? "hold" : "linear",
          }}
          minimumTick={0}
          maximumTick={960}
          ppq={960}
          tempoMap={{ points: [{ time_tick: 0, bpm: 120 }] }}
          onApply={onApply}
          onDelete={vi.fn()}
        />
      </PopoverContent>
    </Popover>,
  );
  return onApply;
}

describe("AutomationKeyframeInspector", () => {
  it("edits normalized percent values in user-facing percent units", () => {
    const onApply = renderInspector(masterDimmer);
    const input = screen.getByLabelText("Master dimmer (%)");
    expect(input).toHaveProperty("value", "100");

    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.click(screen.getByLabelText("Interpolation"));
    expect(screen.getByRole("option", { name: "bezier" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Apply/ }));

    expect(onApply).toHaveBeenCalledWith({
      time_tick: 0,
      value: { type: "scalar", value: 0.25 },
      interpolation: "linear",
    });
    expect(screen.getByText("1.1.000 · 0:00.000")).toBeTruthy();
  });

  it("uses native typed color and degree inputs", () => {
    const color: ParameterDefinitionDSL = {
      id: "color",
      name: "Color",
      value_type: "color",
      default_value: { type: "color", value: "#ff0000" },
      unit: "color",
      ui_hint: "color",
      automation: "continuous",
    };
    renderInspector(color);
    expect(screen.getByLabelText("Color")).toHaveProperty("type", "color");
  });

  it("labels angle values in degrees", () => {
    const angle: ParameterDefinitionDSL = {
      id: "pan",
      name: "Pan",
      value_type: "scalar",
      default_value: { type: "scalar", value: 30 },
      range: [-270, 270],
      unit: "degrees",
      ui_hint: "angle",
      automation: "continuous",
    };
    renderInspector(angle);
    expect(screen.getByLabelText("Pan (°)")).toHaveProperty("value", "30");
  });
});
