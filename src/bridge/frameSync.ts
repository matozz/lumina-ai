import type { FramePayload } from "./types";

export interface FrameCursor {
  showRevision: number;
  frameSequence: number;
}

export interface FrameDecision {
  accept: boolean;
  requestFull: boolean;
  next: FrameCursor | null;
}

export function assessFrame(previous: FrameCursor | null, frame: FramePayload): FrameDecision {
  const next = {
    showRevision: frame.show_revision,
    frameSequence: frame.frame_sequence,
  };

  if (!previous) {
    return frame.full
      ? { accept: true, requestFull: false, next }
      : { accept: false, requestFull: true, next: null };
  }

  if (
    frame.show_revision < previous.showRevision ||
    frame.frame_sequence <= previous.frameSequence
  ) {
    return { accept: false, requestFull: true, next: previous };
  }

  const revisionChanged = frame.show_revision !== previous.showRevision;
  const sequenceGap = frame.frame_sequence !== previous.frameSequence + 1;
  if ((revisionChanged || sequenceGap) && !frame.full) {
    return { accept: false, requestFull: true, next: previous };
  }

  return { accept: true, requestFull: false, next };
}
