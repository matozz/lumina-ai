import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AutomationParameterOption } from "../automationParameters";
import { AutomationParameterMenu } from "./AutomationParameterMenu";

const option: AutomationParameterOption = {
  definition: {
    id: "speed",
    name: "Speed",
    schema: {
      type: "scalar",
      default: 1,
      range: { min: 0.1, max: 4, step: 0.1 },
      unit: "multiplier",
    },
    scope: "arrangement",
    section: "main",
    help: "Playback speed.",
  },
  initialValue: { type: "scalar", value: 2 },
  target: {
    scope: "effect_instance",
    instance_id: "front",
    parameter_id: "speed",
  },
};

describe("AutomationParameterMenu", () => {
  it("selects a typed parameter and closes the menu", () => {
    const onSelect = vi.fn();
    render(
      <AutomationParameterMenu
        label="Add automation to front"
        options={[option]}
        onSelect={onSelect}
        compact
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add automation to front" }));
    fireEvent.click(screen.getByRole("button", { name: /Speed/ }));

    expect(onSelect).toHaveBeenCalledWith(option);
    expect(screen.queryByText("Select a typed parameter. Existing targets are hidden.")).toBeNull();
  });
});
