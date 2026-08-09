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
  it("keeps Delete and Backspace inside the editor instead of bubbling to the timeline", () => {
    const onTimelineKeyDown = vi.fn();
    render(
      <div onKeyDown={onTimelineKeyDown}>
        <Popover open>
          <PopoverTrigger render={<button>Keyframe</button>} />
          <PopoverContent>
            <AutomationKeyframeInspector
              canDelete
              definition={masterDimmer}
              keyframe={{
                id: "key-0",
                time_tick: 0,
                value: masterDimmer.default_value,
                interpolation: "linear",
              }}
              minimumTick={0}
              maximumTick={960}
              ppq={960}
              tempoMap={{ points: [{ time_tick: 0, bpm: 120 }] }}
              onApply={vi.fn()}
              onDelete={vi.fn()}
            />
          </PopoverContent>
        </Popover>
      </div>,
    );

    const valueInput = screen.getByLabelText("Master dimmer (%)");
    fireEvent.keyDown(valueInput, { key: "Delete" });
    fireEvent.keyDown(valueInput, { key: "Backspace" });

    expect(onTimelineKeyDown).not.toHaveBeenCalled();
  });

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

  it("round-trips a native color picker and an explicit #RRGGBB value", () => {
    const color: ParameterDefinitionDSL = {
      id: "color",
      name: "Color",
      value_type: "color",
      default_value: { type: "color", value: "#ff0000" },
      unit: "color",
      ui_hint: "color",
      automation: "continuous",
    };
    const onApply = renderInspector(color);
    expect(screen.getByLabelText("Color color picker")).toHaveProperty("type", "color");
    expect(screen.getByLabelText("Color hex value")).toHaveProperty("value", "#FF0000");

    fireEvent.change(screen.getByLabelText("Color hex value"), {
      target: { value: "#12abef" },
    });
    expect(screen.getByLabelText("Color color picker")).toHaveProperty("value", "#12abef");
    fireEvent.click(screen.getByRole("button", { name: /Apply/ }));
    expect(onApply).toHaveBeenCalledWith({
      time_tick: 0,
      value: { type: "color", value: "#12ABEF" },
      interpolation: "linear",
    });
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

  it("edits speed keyframes only through beat-synced ratios", () => {
    const speed: ParameterDefinitionDSL = {
      id: "speed",
      name: "Speed",
      value_type: "scalar",
      default_value: { type: "scalar", value: 1 },
      range: [0.125, 8],
      unit: "multiplier",
      ui_hint: "slider",
      automation: "continuous",
    };
    const onApply = renderInspector(speed);

    fireEvent.click(screen.getByLabelText("Speed (×)"));
    expect(screen.queryByRole("option", { name: "1.25×" })).toBeNull();
    const quadrupleSpeed = screen.getByRole("option", { name: "4×" });
    fireEvent.mouseMove(quadrupleSpeed);
    fireEvent.click(quadrupleSpeed);
    fireEvent.click(screen.getByRole("button", { name: /Apply/ }));

    expect(onApply).toHaveBeenCalledWith({
      time_tick: 0,
      value: { type: "scalar", value: 4 },
      interpolation: "linear",
    });
  });
});
