import { describe, expect, it } from "vitest";
import { assessFrame, type FrameCursor } from "./frameSync";
import type { FramePayload } from "./types";

function frame(overrides: Partial<FramePayload> = {}): FramePayload {
  return {
    show_revision: 1,
    frame_sequence: 1,
    logical_beat: 0,
    full: true,
    outputs: [],
    ...overrides,
  };
}

describe("frame synchronization", () => {
  it("requires the first accepted frame to be full", () => {
    expect(assessFrame(null, frame({ full: false }))).toEqual({
      accept: false,
      requestFull: true,
      next: null,
    });
    expect(assessFrame(null, frame())).toEqual({
      accept: true,
      requestFull: false,
      next: { showRevision: 1, frameSequence: 1 },
    });
  });

  it("rejects gaps and stale frames until a full resync arrives", () => {
    const previous: FrameCursor = { showRevision: 1, frameSequence: 4 };
    expect(assessFrame(previous, frame({ frame_sequence: 6, full: false }))).toEqual({
      accept: false,
      requestFull: true,
      next: previous,
    });
    expect(assessFrame(previous, frame({ frame_sequence: 6, full: true }))).toEqual({
      accept: true,
      requestFull: false,
      next: { showRevision: 1, frameSequence: 6 },
    });
    expect(assessFrame(previous, frame({ frame_sequence: 3 }))).toEqual({
      accept: false,
      requestFull: true,
      next: previous,
    });
  });

  it("requires revision changes to carry a full frame", () => {
    const previous: FrameCursor = { showRevision: 1, frameSequence: 9 };
    expect(
      assessFrame(previous, frame({ show_revision: 2, frame_sequence: 10, full: false })),
    ).toEqual({ accept: false, requestFull: true, next: previous });
    expect(
      assessFrame(previous, frame({ show_revision: 2, frame_sequence: 10, full: true })),
    ).toEqual({
      accept: true,
      requestFull: false,
      next: { showRevision: 2, frameSequence: 10 },
    });
  });
});
