import { describe, expect, it } from "vitest";
import { createTimelineGeometry } from "@/panel/timelineGeometry";
import { createHouseArrangementReference } from "./houseArrangementReference";
import {
  EMPTY_ARRANGEMENT_SELECTION,
  arrangementSelectionHitLayout,
  arrangementSelectionItemKey,
  selectionAfterClick,
  selectionAfterMarquee,
  type ArrangementClipSelectionItem,
} from "./arrangementSelection";

describe("Arrangement selection geometry", () => {
  it("marquee-selects all sixteen Drop A clips from model geometry", () => {
    const arrangement = createHouseArrangementReference();
    const geometry = createTimelineGeometry(arrangement.ppq, 4, 480);
    const layout = arrangementSelectionHitLayout(arrangement, geometry);
    const dropStart = (69_120 / arrangement.ppq) * geometry.beatWidth;
    const dropEnd = (84_480 / arrangement.ppq) * geometry.beatWidth;
    const selection = selectionAfterMarquee(
      layout,
      { left: dropStart, right: dropEnd, top: 0, bottom: 63 },
      EMPTY_ARRANGEMENT_SELECTION,
      false,
    );

    expect(selection.items).toHaveLength(16);
    expect(selection.items.every((item) => item.type === "clip")).toBe(true);
    expect(selection.items.map(arrangementSelectionItemKey)).toContain("clip:cues:drop-a-16");
  });

  it("selects keyframe centers across multiple lanes without querying DOM nodes", () => {
    const arrangement = createHouseArrangementReference();
    const geometry = createTimelineGeometry(arrangement.ppq, 4, 480);
    const layout = arrangementSelectionHitLayout(arrangement, geometry);
    const selection = selectionAfterMarquee(
      layout,
      { left: 190, right: 310, top: 64, bottom: 224 },
      EMPTY_ARRANGEMENT_SELECTION,
      false,
    );

    expect(selection.items.some((item) => item.type === "keyframe")).toBe(true);
    expect(
      new Set(selection.items.filter((item) => item.type === "keyframe").map((item) => item.laneId))
        .size,
    ).toBeGreaterThan(1);
  });

  it("supports additive marquee, command-toggle, and snapshot rollback", () => {
    const item: ArrangementClipSelectionItem = {
      type: "clip",
      trackId: "cues",
      clipId: "full-fade",
    };
    const selected = selectionAfterClick(EMPTY_ARRANGEMENT_SELECTION, item);
    const toggledOff = selectionAfterClick(selected, item, { toggle: true });

    expect(selected.items).toEqual([item]);
    expect(toggledOff.items).toEqual([]);

    const arrangement = createHouseArrangementReference();
    const layout = arrangementSelectionHitLayout(
      arrangement,
      createTimelineGeometry(arrangement.ppq, 4, 480),
    );
    const additive = selectionAfterMarquee(
      layout,
      { left: 288, right: 292, top: 0, bottom: 63 },
      selected,
      true,
    );
    expect(additive.items.map(arrangementSelectionItemKey)).toContain("clip:cues:full-fade");
    expect(additive.items.length).toBeGreaterThan(1);

    const rolledBack = selected;
    expect(rolledBack).toEqual(selected);
  });

  it("builds model hit geometry for 1,000 dense clips, visual subrows, and many lanes", () => {
    const arrangement = createHouseArrangementReference();
    arrangement.tracks[0].clips = Array.from({ length: 1_000 }, (_, index) => ({
      id: `dense-${index + 1}`,
      cue_ref: { id: "dense-cue", revision: 1 },
      start_tick: index * 240,
      duration_tick: 480,
      layer: 0,
    }));
    arrangement.tracks[0].automation_lanes = Array.from({ length: 8 }, (_, laneIndex) => ({
      id: `lane-${laneIndex + 1}`,
      target: { scope: "global" as const, parameter_id: "master_dimmer" as const },
      keyframes: Array.from({ length: 24 }, (_, keyframeIndex) => ({
        id: `lane-${laneIndex + 1}-keyframe-${keyframeIndex + 1}`,
        time_tick: keyframeIndex * 9_600,
        value: { type: "scalar" as const, value: keyframeIndex / 24 },
        interpolation: "linear" as const,
      })),
    }));

    const geometry = createTimelineGeometry(arrangement.ppq, 4, 480);
    const layout = arrangementSelectionHitLayout(arrangement, geometry);
    const clipRows = new Set(layout.clips.map((entry) => entry.rect.top));
    const selection = selectionAfterMarquee(
      layout,
      { left: 0, right: 1_000, top: 0, bottom: layout.height },
      EMPTY_ARRANGEMENT_SELECTION,
      false,
    );

    expect(layout.clips).toHaveLength(1_000);
    expect(layout.keyframes).toHaveLength(192);
    expect(clipRows.size).toBeGreaterThan(1);
    expect(selection.items.length).toBeGreaterThan(1_000);
  });
});
