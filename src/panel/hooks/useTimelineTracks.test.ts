import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TimelineEventDSL } from "@/bridge/types";
import { createStarterProject } from "@/workspace/defaultProject";
import { createEffectPair } from "@/workspace/effect-lab/effectFactory";
import { useTimelineTracks } from "./useTimelineTracks";

describe("useTimelineTracks", () => {
  it("keeps internal instance ids out of user-facing track names", () => {
    const document = createStarterProject();
    const pair = createEffectPair(document, "Red pulse");
    document.effect_definitions.push(pair.definition);
    document.effect_instances.push(pair.instance);
    const events: TimelineEventDSL[] = [
      {
        id: "clip-1",
        beat: 0,
        duration: 4,
        action: { type: "effect", instance_id: pair.instance.id },
      },
    ];

    const { result } = renderHook(() => useTimelineTracks(events, document));

    expect(result.current[0]).toMatchObject({
      id: `phaser:${pair.instance.id}`,
      name: "Red pulse",
    });
    expect(result.current[0].name).not.toContain("project.");
  });

  it("uses the project track label for an empty arrangement", () => {
    const document = createStarterProject();
    document.timeline!.tracks[0].name = "Main lighting looks";

    const { result } = renderHook(() => useTimelineTracks([], document));

    expect(result.current).toEqual([
      expect.objectContaining({ id: "effects", name: "Main lighting looks", events: [] }),
    ]);
  });
});
