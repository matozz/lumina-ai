import { describe, expect, it } from "vitest";
import {
  createHouseArrangementReference,
  HOUSE_REFERENCE_EDITED_END_TICK,
  HOUSE_REFERENCE_LENGTH_TICKS,
  HOUSE_REFERENCE_PPQ,
} from "./houseArrangementReference";

describe("House 128 Custom editing reference", () => {
  it("captures the 132 BPM, 64-bar document without filling the empty tail", () => {
    const arrangement = createHouseArrangementReference();
    const clips = arrangement.tracks[0].clips ?? [];
    const editedEnd = Math.max(...clips.map((clip) => clip.start_tick + clip.duration_tick));

    expect(arrangement.tempo_map.points).toEqual([{ time_tick: 0, bpm: 132 }]);
    expect(arrangement.ppq).toBe(HOUSE_REFERENCE_PPQ);
    expect(arrangement.length_ticks).toBe(HOUSE_REFERENCE_LENGTH_TICKS);
    expect(editedEnd).toBe(HOUSE_REFERENCE_EDITED_END_TICK);
    expect(arrangement.length_ticks - editedEnd).toBe(138_240);
  });

  it("captures the dense short-clip and typed automation editing load", () => {
    const arrangement = createHouseArrangementReference();
    const track = arrangement.tracks[0];
    const clips = track.clips ?? [];
    const durations = clips.map((clip) => clip.duration_tick);

    expect(clips).toHaveLength(39);
    expect(durations.filter((duration) => duration === HOUSE_REFERENCE_PPQ)).toHaveLength(33);
    expect(durations.filter((duration) => duration === HOUSE_REFERENCE_PPQ / 2)).toHaveLength(2);
    expect(durations.filter((duration) => duration > HOUSE_REFERENCE_PPQ)).toHaveLength(4);
    expect(durations.filter((duration) => duration <= HOUSE_REFERENCE_PPQ)).toHaveLength(35);
    expect(clips.every((clip) => clip.layer === 0)).toBe(true);
    expect(track.automation_lanes).toHaveLength(4);
  });

  it("uses readable fixture IDs while preserving the original one-tick step encoding", () => {
    const arrangement = createHouseArrangementReference();
    const track = arrangement.tracks[0];
    const ids = (track.clips ?? []).map((clip) => clip.id);
    const speed = track.automation_lanes?.find((lane) => lane.id === "full-breath-speed");

    expect(ids.some((id) => id.includes("copy-copy"))).toBe(false);
    expect(speed?.keyframes.map((keyframe) => keyframe.time_tick)).toContain(46_081);
    expect(speed?.keyframes.map((keyframe) => keyframe.time_tick)).toContain(53_761);
  });
});
