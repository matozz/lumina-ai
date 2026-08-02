import { describe, expect, it } from "vitest";
import type { TimelineTrackData } from "./types";
import { calculateTimelineDimensions } from "./utils";

describe("calculateTimelineDimensions", () => {
  it("includes automation subtracks when sizing the timeline", () => {
    const tracks: TimelineTrackData[] = [
      {
        id: "phaser:pulse",
        name: "pulse",
        events: [],
        subTracks: [
          {
            name: "intensity",
            events: [
              {
                id: "lane-intensity",
                originalIndex: 0,
                beat: 64,
                duration: 8,
                action: {
                  type: "animate",
                  from: 0,
                  to: 1,
                  target: {
                    scope: "effect_instance",
                    instance_id: "pulse",
                    parameter_id: "intensity",
                  },
                },
              },
            ],
          },
        ],
      },
    ];

    expect(calculateTimelineDimensions(tracks, 0, 40).totalBeats).toBe(76);
  });
});
