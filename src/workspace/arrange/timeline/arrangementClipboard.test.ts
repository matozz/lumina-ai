import { describe, expect, it } from "vitest";
import {
  copyArrangementSelection,
  duplicateArrangementSelection,
  pasteArrangementSelection,
} from "./arrangementClipboard";
import { createHouseArrangementReference } from "./houseArrangementReference";
import type { ArrangementTimelineSelection } from "./arrangementSelection";

describe("Arrangement typed clipboard", () => {
  it("duplicates a 16-beat pattern after its selection span with readable IDs", () => {
    const arrangement = createHouseArrangementReference();
    const selection = clipSelection(
      ...Array.from({ length: 16 }, (_, index) => `drop-a-${String(index + 1).padStart(2, "0")}`),
    );

    const pasted = duplicateArrangementSelection(arrangement, selection, 480);
    const copiedClips = pasted.items.filter((item) => item.type === "clip");

    expect(copiedClips).toHaveLength(16);
    expect(arrangement.tracks[0].clips).toHaveLength(55);
    expect(
      arrangement.tracks[0].clips?.find((clip) => clip.id === "drop-a-01-copy")?.start_tick,
    ).toBe(84_480);
    expect(arrangement.tracks[0].clips?.some((clip) => clip.id.includes("copy-copy"))).toBe(false);
  });

  it("copies a CueClip with remapped lane, target, and keyframe IDs", () => {
    const arrangement = createHouseArrangementReference();
    const selection = clipSelection("full-breath");

    const pasted = duplicateArrangementSelection(arrangement, selection, 480);
    const pastedClip = pasted.items.find((item) => item.type === "clip")!;
    const lanes = arrangement.tracks[0].automation_lanes?.filter(
      (lane) => lane.target.scope === "cue_layer" && lane.target.clip_id === pastedClip.clipId,
    );

    expect(pastedClip.clipId).toBe("full-breath-copy");
    expect(lanes).toHaveLength(2);
    expect(lanes?.every((lane) => lane.id.endsWith("-copy"))).toBe(true);
    expect(
      lanes?.every((lane) => lane.keyframes.every((keyframe) => keyframe.id.startsWith(lane.id))),
    ).toBe(true);
  });

  it("copies keyframes across lanes without exposing a system clipboard payload", () => {
    const arrangement = createHouseArrangementReference();
    const selection: ArrangementTimelineSelection = {
      anchor: null,
      primary: null,
      items: [
        {
          type: "keyframe",
          trackId: "cues",
          laneId: "full-breath-speed",
          keyframeId: "bar-13-hold",
        },
        {
          type: "keyframe",
          trackId: "cues",
          laneId: "full-breath-intensity",
          keyframeId: "bar-13",
        },
      ],
    };
    const payload = copyArrangementSelection(arrangement, selection);
    const pasted = pasteArrangementSelection(arrangement, payload, payload.originTick + 960);

    expect(payload.type).toBe("lumina/arrangement-selection-v1");
    expect(payload).not.toHaveProperty("projectBundle");
    expect(pasted.items).toHaveLength(2);
    expect(
      arrangement.tracks[0].automation_lanes
        ?.find((lane) => lane.id === "full-breath-speed")
        ?.keyframes.some((keyframe) => keyframe.time_tick === 47_040),
    ).toBe(true);
  });

  it("rejects cross-Arrangement paste without changing the target", () => {
    const source = createHouseArrangementReference();
    const payload = copyArrangementSelection(source, clipSelection("full-fade"));
    const target = createHouseArrangementReference();
    target.id = "another-arrangement";
    const before = structuredClone(target);

    expect(() => pasteArrangementSelection(target, payload, 0)).toThrow(/source Arrangement/);
    expect(target).toEqual(before);
  });
});

function clipSelection(...clipIds: string[]): ArrangementTimelineSelection {
  return {
    anchor: null,
    primary: null,
    items: clipIds.map((clipId) => ({ type: "clip", trackId: "cues", clipId })),
  };
}
