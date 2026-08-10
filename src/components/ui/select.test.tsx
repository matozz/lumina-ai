import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select, SelectTrigger, SelectValue } from "./select";

describe("SelectTrigger", () => {
  it("uses the compact 24px control height for default and small triggers", () => {
    render(
      <>
        <Select>
          <SelectTrigger aria-label="Default select">
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
        </Select>
        <Select>
          <SelectTrigger aria-label="Small select" size="sm">
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
        </Select>
      </>,
    );

    expect(screen.getByLabelText("Default select").className).toContain("h-6");
    expect(screen.getByLabelText("Small select").className).toContain("h-6");
  });
});
