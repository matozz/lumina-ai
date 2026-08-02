import { describe, expect, it } from "vitest";
import type { UITimelineEvent } from "./types";
import { viewportFromScroll, visibleTimelineEvents } from "./virtualization";

describe("timeline viewport culling", () => {
  it("keeps the mounted DOM bounded for one thousand sequential clips", () => {
    const events: UITimelineEvent[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: `clip-${index}`,
      originalIndex: index,
      beat: index * 2,
      duration: 1,
      action: { type: "effect", instance_id: "pulse" },
    }));
    const viewport = viewportFromScroll(20_000, 1_200, 40);
    const visible = visibleTimelineEvents(events, viewport);

    expect(visible.length).toBeLessThanOrEqual(24);
    expect(visible[0].beat).toBeGreaterThanOrEqual(viewport.startBeat - 1);
    expect(visible[visible.length - 1].beat).toBeLessThanOrEqual(viewport.endBeat);
    expect(viewport.visibleStartBeat).toBe(500);
    expect(viewport.visibleEndBeat).toBe(530);
  });
});
