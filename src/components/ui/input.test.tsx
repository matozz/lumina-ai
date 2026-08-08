import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Input } from "./input";

describe("Input", () => {
  it("removes redundant leading zeros before updating controlled numeric state", () => {
    function ControlledNumberInput() {
      const [value, setValue] = useState(0);
      return (
        <Input
          aria-label="Gap Y"
          type="number"
          value={value}
          onChange={(event) => setValue(Number(event.currentTarget.value))}
        />
      );
    }

    render(<ControlledNumberInput />);
    const input = screen.getByLabelText<HTMLInputElement>("Gap Y");

    fireEvent.change(input, { target: { value: "000" } });

    expect(input.value).toBe("0");
  });

  it("preserves valid decimals while removing only their redundant leading zeros", () => {
    const values: string[] = [];
    render(
      <Input
        aria-label="Offset"
        type="number"
        defaultValue={0}
        onChange={(event) => values.push(event.currentTarget.value)}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>("Offset");

    fireEvent.change(input, { target: { value: "0.5" } });
    fireEvent.change(input, { target: { value: "000.5" } });

    expect(values).toEqual(["0.5", "0.5"]);
    expect(input.value).toBe("0.5");
  });
});
