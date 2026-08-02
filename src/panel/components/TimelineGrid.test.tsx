import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimelineGrid } from "./TimelineGrid";
import { createTimelineGeometry } from "../timelineGeometry";

describe("TimelineGrid", () => {
  it("renders only viewport bar labels over a CSS-backed grid", () => {
    const { container } = render(
      <TimelineGrid
        geometry={createTimelineGeometry(960, 40)}
        viewport={{ startBeat: 500, endBeat: 546 }}
      />,
    );

    expect(container.querySelectorAll("[data-bar-beat]").length).toBeLessThanOrEqual(14);
    expect((container.firstElementChild as HTMLElement).style.backgroundImage).toContain(
      "linear-gradient",
    );
  });
});
