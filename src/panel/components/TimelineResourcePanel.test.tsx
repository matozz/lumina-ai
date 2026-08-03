import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStarterProject } from "@/workspace/defaultProject";
import { createEffectPair } from "@/workspace/effect-lab/effectFactory";
import { TimelineResourcePanel } from "./TimelineResourcePanel";

describe("TimelineResourcePanel", () => {
  it("offers the current Draft effect revision for click and native drag placement", () => {
    const document = createStarterProject();
    const pair = createEffectPair(document);
    pair.definition.revision = 3;
    pair.instance.definition_revision = 3;
    document.effect_definitions.push(pair.definition);
    document.effect_instances.push(pair.instance);
    const onSelectPhaser = vi.fn();
    const setData = vi.fn();
    const dataTransfer = { setData, effectAllowed: "none" };

    render(
      <TimelineResourcePanel
        document={document}
        selectedPhaser={null}
        onSelectPhaser={onSelectPhaser}
      />,
    );

    const effect = screen.getByRole("button", {
      name: "Red Pulse, revision 3. Select or drag to timeline",
    });
    fireEvent.click(effect);
    fireEvent.dragStart(effect, { dataTransfer });

    expect(screen.getByText("r3")).toBeTruthy();
    expect(onSelectPhaser).toHaveBeenCalledWith(pair.instance.id);
    expect(setData).toHaveBeenCalledWith("application/x-lumina-effect-instance", pair.instance.id);
  });

  it("explains how to recover from an empty effect library", () => {
    render(
      <TimelineResourcePanel
        document={createStarterProject()}
        selectedPhaser={null}
        onSelectPhaser={vi.fn()}
      />,
    );

    expect(screen.getByText("No effects yet.")).toBeTruthy();
    expect(screen.getByText(/Create one in Effect Lab/)).toBeTruthy();
  });
});
