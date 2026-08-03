import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EditableLayoutShape, StageLayoutParameters } from "./stageSetup";
import { layoutParametersFromLayout } from "./stageSetup";
import { StageLayoutEditor } from "./StageLayoutEditor";

const fixtureIds = [1, 2, 3, 4];

describe("StageLayoutEditor", () => {
  it("provides visual matrix controls without Raw DSL", () => {
    render(<Harness shape="matrix" />);

    fireEvent.change(screen.getByLabelText("Columns"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Spacing"), { target: { value: "72" } });

    expect((screen.getByLabelText("Columns") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("Spacing") as HTMLInputElement).value).toBe("72");
    expect(screen.getByRole("img", { name: "4 fixture layout preview" })).toBeTruthy();
  });

  it("supports formula and custom coordinate keyboard editing", () => {
    const { rerender } = render(<Harness shape="formula" />);
    fireEvent.change(screen.getByLabelText("X formula"), { target: { value: "t * 100" } });
    expect((screen.getByLabelText("X formula") as HTMLInputElement).value).toBe("t * 100");

    rerender(<Harness shape="custom" />);
    const x = screen.getByLabelText("Fixture 1 X");
    x.focus();
    fireEvent.change(x, { target: { value: "42" } });
    expect(document.activeElement).toBe(x);
    expect((screen.getByLabelText("Fixture 1 X") as HTMLInputElement).value).toBe("42");
    expect(screen.getByRole("button", { name: "Reset coordinates to grid" })).toBeTruthy();
  });
});

function Harness({ shape }: { shape: EditableLayoutShape }) {
  const [parameters, setParameters] = useState<StageLayoutParameters>(() =>
    layoutParametersFromLayout(null, fixtureIds),
  );
  return (
    <StageLayoutEditor
      shape={shape}
      fixtureIds={fixtureIds}
      parameters={parameters}
      onChange={setParameters}
    />
  );
}
