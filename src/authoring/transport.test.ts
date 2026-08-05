import { beforeEach, describe, expect, it } from "vitest";
import {
  AuthoringTransportError,
  authoringSessionKey,
  authoringTransportActions,
  useAuthoringTransportStore,
} from "./transport";

describe("AuthoringTransport session state", () => {
  const key = authoringSessionKey("effect", "pulse@1");

  beforeEach(() => authoringTransportActions.reset());

  it("uses explicit Play, Pause, Stop and Seek transitions", () => {
    authoringTransportActions.ensureSession({ key, scope: "effect", durationTicks: 3_840 });
    authoringTransportActions.seek(key, 1_200, 10);
    authoringTransportActions.play(key, 20);
    expect(useAuthoringTransportStore.getState().sessions[key]).toMatchObject({
      playback: "playing",
      cursorTick: 1_200,
      anchorTick: 1_200,
      anchorTimeMs: 20,
    });

    authoringTransportActions.publishCursor(key, 1_680);
    authoringTransportActions.pause(key, 30);
    expect(useAuthoringTransportStore.getState().sessions[key]).toMatchObject({
      playback: "paused",
      cursorTick: 1_680,
      anchorTick: 1_680,
    });

    authoringTransportActions.stop(key, 40);
    expect(useAuthoringTransportStore.getState().sessions[key]).toMatchObject({
      playback: "stopped",
      cursorTick: 0,
    });
  });

  it("keeps local preview timing in the session store", () => {
    authoringTransportActions.ensureSession({ key, scope: "effect", durationTicks: 3_840 });
    authoringTransportActions.setLocalTiming(
      key,
      { bpm: 128, numerator: 3, denominator: 4, loopBars: 2 },
      10,
    );

    expect(useAuthoringTransportStore.getState().sessions[key].localTiming).toEqual({
      bpm: 128,
      numerator: 3,
      denominator: 4,
      loopBars: 2,
    });
    expect(useAuthoringTransportStore.getState().sessions[key]).toMatchObject({
      durationTicks: 5_760,
      loopStartTick: 0,
      loopEndTick: 5_760,
    });
  });

  it("pauses every running authoring session before the user changes context", () => {
    const cueKey = authoringSessionKey("cue", "drop@1");
    authoringTransportActions.ensureSession({ key, scope: "effect", durationTicks: 3_840 });
    authoringTransportActions.ensureSession({ key: cueKey, scope: "cue", durationTicks: 3_840 });
    authoringTransportActions.play(key, 10);
    authoringTransportActions.play(cueKey, 10);

    authoringTransportActions.pauseAll(20);

    expect(useAuthoringTransportStore.getState().sessions[key].playback).toBe("paused");
    expect(useAuthoringTransportStore.getState().sessions[cueKey].playback).toBe("paused");
  });

  it("rejects Local timing for Arrangement and invalid loop ranges", () => {
    const arrangementKey = authoringSessionKey("arrangement", "house@1");
    authoringTransportActions.ensureSession({
      key: arrangementKey,
      scope: "arrangement",
      durationTicks: 10_000,
    });

    expect(() => authoringTransportActions.setClockSource(arrangementKey, "local")).toThrowError(
      AuthoringTransportError,
    );
    expect(() =>
      authoringTransportActions.setLoop(arrangementKey, {
        enabled: true,
        startTick: 4_000,
        endTick: 4_000,
      }),
    ).toThrowError(/Loop end/);
  });

  it("preserves a session when an Arrangement revision forks", () => {
    const sourceKey = authoringSessionKey("arrangement", "house@1");
    const targetKey = authoringSessionKey("arrangement", "house@2");
    authoringTransportActions.ensureSession({
      key: sourceKey,
      scope: "arrangement",
      durationTicks: 10_000,
    });
    authoringTransportActions.seek(sourceKey, 5_760, 10);
    authoringTransportActions.setLoop(
      sourceKey,
      { enabled: true, startTick: 960, endTick: 7_680 },
      20,
    );
    authoringTransportActions.play(sourceKey, 30);
    authoringTransportActions.copySession(sourceKey, {
      key: targetKey,
      scope: "arrangement",
      durationTicks: 10_000,
    });

    expect(useAuthoringTransportStore.getState().sessions[targetKey]).toMatchObject({
      playback: "paused",
      cursorTick: 5_760,
      loopEnabled: true,
      loopStartTick: 960,
      loopEndTick: 7_680,
    });
  });
});
