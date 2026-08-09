import { describe, expect, it, vi } from "vitest";
import { createHouseArrangementReference } from "./houseArrangementReference";
import { keyframeSelectionMoveBounds } from "./arrangementKeyframeProjection";
import { projectRegisteredKeyframeLanes } from "./arrangementKeyframeProjection";

describe("Arrangement keyframe projection", () => {
  it("intersects neighbor and Arrangement bounds across selected lanes", () => {
    const arrangement = createHouseArrangementReference();
    const speed = arrangement.tracks[0].automation_lanes?.find(
      (lane) => lane.id === "full-breath-speed",
    )!;
    const intensity = arrangement.tracks[0].automation_lanes?.find(
      (lane) => lane.id === "full-breath-intensity",
    )!;
    speed.keyframes = [
      { ...speed.keyframes[0], id: "speed-a", time_tick: 100 },
      { ...speed.keyframes[0], id: "speed-b", time_tick: 200 },
    ];
    intensity.keyframes = [
      { ...intensity.keyframes[0], id: "intensity-a", time_tick: 150 },
      { ...intensity.keyframes[0], id: "intensity-b", time_tick: 180 },
    ];

    expect(
      keyframeSelectionMoveBounds(arrangement, [
        {
          type: "keyframe",
          trackId: "cues",
          laneId: speed.id,
          keyframeId: "speed-a",
        },
        {
          type: "keyframe",
          trackId: "cues",
          laneId: intensity.id,
          keyframeId: "intensity-a",
        },
      ]),
    ).toEqual({ minimum: -100, maximum: 29 });
  });

  it("projects selected points through every registered lane in one shared frame", () => {
    const speed = vi.fn();
    const intensity = vi.fn();
    const controllers = new Map([
      ["cues\u0000speed", speed],
      ["cues\u0000intensity", intensity],
    ]);

    projectRegisteredKeyframeLanes(
      controllers,
      [
        { type: "keyframe", trackId: "cues", laneId: "speed", keyframeId: "speed-a" },
        {
          type: "keyframe",
          trackId: "cues",
          laneId: "intensity",
          keyframeId: "intensity-a",
        },
      ],
      240,
    );

    expect([...speed.mock.calls[0][0]]).toEqual(["speed-a"]);
    expect([...intensity.mock.calls[0][0]]).toEqual(["intensity-a"]);
    expect(speed).toHaveBeenCalledWith(expect.any(Set), 240);
    expect(intensity).toHaveBeenCalledWith(expect.any(Set), 240);
  });
});
