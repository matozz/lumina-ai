import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceRail } from "./WorkspaceRail";

describe("WorkspaceRail", () => {
  it("exposes all five primary workspaces as named keyboard-focusable buttons", () => {
    const onSelect = vi.fn();
    render(
      <TooltipProvider>
        <WorkspaceRail activeWorkspace="stage" onSelect={onSelect} />
      </TooltipProvider>,
    );

    for (const name of ["Stage", "Effect Lab", "Song", "Arrange", "Live / Rehearse"]) {
      const button = screen.getByRole("button", { name });
      button.focus();
      expect(document.activeElement).toBe(button);
    }

    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
    expect(onSelect).toHaveBeenCalledWith("arrange");
  });
});
