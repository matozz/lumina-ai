import { beforeEach, describe, expect, it } from "vitest";
import { timelineActions, useTimelineStore } from "./timeline";

describe("timeline store", () => {
  beforeEach(() => {
    useTimelineStore.setState(useTimelineStore.getInitialState(), true);
  });

  it("adds and deletes events while preserving stable original indexes", () => {
    timelineActions.addEvent({
      beat: 4,
      duration: 2,
      action: { type: "phaser", phaser: "pulse" },
    });
    timelineActions.addEvent({
      beat: 8,
      action: { type: "phaser", phaser: "chase" },
    });

    expect(useTimelineStore.getState().events).toEqual([
      {
        beat: 4,
        duration: 2,
        action: { type: "phaser", phaser: "pulse" },
        originalIndex: 0,
      },
      {
        beat: 8,
        action: { type: "phaser", phaser: "chase" },
        originalIndex: 1,
      },
    ]);

    timelineActions.deleteEvent(0);

    expect(useTimelineStore.getState().events).toEqual([
      {
        beat: 8,
        action: { type: "phaser", phaser: "chase" },
        originalIndex: 1,
      },
    ]);
  });

  it("toggles expanded tracks without replacing other track state", () => {
    timelineActions.setExpandedTracks({ Color: true, Dimmer: false });

    timelineActions.toggleTrackExpanded("Dimmer");

    expect(useTimelineStore.getState().expandedTracks).toEqual({
      Color: true,
      Dimmer: true,
    });
  });
});
