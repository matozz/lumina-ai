import { create } from "zustand";
import { createLocalPreviewClock, type LocalPreviewTiming } from "./musicalTime";

export type AuthoringScope = "effect" | "cue" | "arrangement";
export type AuthoringPlayback = "stopped" | "playing" | "paused";
export type PreviewClockSource = "local" | "arrangement";

export interface AuthoringTransportSession {
  key: string;
  scope: AuthoringScope;
  playback: AuthoringPlayback;
  cursorTick: number;
  anchorTick: number;
  anchorTimeMs: number;
  durationTicks: number;
  loopEnabled: boolean;
  loopStartTick: number;
  loopEndTick: number;
  clockSource: PreviewClockSource;
  localTiming: LocalPreviewTiming;
  commandRevision: number;
}

export interface AuthoringSessionDefaults {
  key: string;
  scope: AuthoringScope;
  durationTicks: number;
  loopEnabled?: boolean;
  clockSource?: PreviewClockSource;
  localTiming?: Partial<LocalPreviewTiming>;
}

interface AuthoringTransportState {
  sessions: Record<string, AuthoringTransportSession>;
}

const DEFAULT_LOCAL_TIMING: LocalPreviewTiming = {
  bpm: 120,
  numerator: 4,
  denominator: 4,
  loopBars: 1,
};

export class AuthoringTransportError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint: string,
  ) {
    super(message);
    this.name = "AuthoringTransportError";
  }
}

export const useAuthoringTransportStore = create<AuthoringTransportState>()(() => ({
  sessions: {},
}));

export const authoringTransportActions = {
  ensureSession(defaults: AuthoringSessionDefaults) {
    const existing = useAuthoringTransportStore.getState().sessions[defaults.key];
    if (existing) return existing;
    const session = createSession(defaults);
    useAuthoringTransportStore.setState((state) => ({
      sessions: { ...state.sessions, [defaults.key]: session },
    }));
    return session;
  },
  configureDuration(key: string, durationTicks: number, now = monotonicNow()) {
    const nextDuration = positiveInteger(durationTicks);
    if (requiredSession(key).durationTicks === nextDuration) return;
    updateCommand(key, now, (session) => {
      const loopCoveredDuration =
        session.loopStartTick === 0 && session.loopEndTick === session.durationTicks;
      session.durationTicks = nextDuration;
      session.cursorTick = clampTick(session.cursorTick, session.durationTicks);
      session.loopStartTick = Math.min(session.loopStartTick, session.durationTicks - 1);
      session.loopEndTick = loopCoveredDuration
        ? session.durationTicks
        : Math.max(session.loopStartTick + 1, Math.min(session.loopEndTick, session.durationTicks));
    });
  },
  play(key: string, now = monotonicNow()) {
    const session = requiredSession(key);
    if (session.playback === "playing") return;
    updateCommand(key, now, (draft) => {
      draft.playback = "playing";
    });
  },
  pause(key: string, now = monotonicNow()) {
    const session = requiredSession(key);
    if (session.playback === "paused") return;
    updateCommand(key, now, (draft) => {
      draft.playback = "paused";
    });
  },
  stop(key: string, now = monotonicNow()) {
    updateCommand(key, now, (session) => {
      session.playback = "stopped";
      session.cursorTick = session.loopEnabled ? session.loopStartTick : 0;
    });
  },
  seek(key: string, cursorTick: number, now = monotonicNow()) {
    updateCommand(key, now, (session) => {
      session.cursorTick = clampTick(cursorTick, session.durationTicks);
    });
  },
  setLoop(
    key: string,
    loop: { enabled: boolean; startTick: number; endTick: number },
    now = monotonicNow(),
  ) {
    updateCommand(key, now, (session) => {
      const startTick = Math.floor(loop.startTick);
      const endTick = Math.floor(loop.endTick);
      if (startTick < 0 || endTick <= startTick || endTick > session.durationTicks) {
        throw new AuthoringTransportError(
          "AUTHORING_LOOP_INVALID",
          "Loop end must be after loop start and inside the preview duration.",
          "Move the loop handles so they define a non-empty tick range.",
        );
      }
      session.loopEnabled = loop.enabled;
      session.loopStartTick = startTick;
      session.loopEndTick = endTick;
      session.cursorTick = clampTick(session.cursorTick, session.durationTicks);
    });
  },
  setClockSource(key: string, clockSource: PreviewClockSource, now = monotonicNow()) {
    updateCommand(key, now, (session) => {
      if (session.scope === "arrangement" && clockSource !== "arrangement") {
        throw new AuthoringTransportError(
          "AUTHORING_CLOCK_SOURCE_INVALID",
          "Arrangement transport must use its own TempoMap and TimeSignatureMap.",
          "Use Local timing only in Effect Lab or Cues.",
        );
      }
      session.clockSource = clockSource;
      if (clockSource === "local") {
        const durationTicks = createLocalPreviewClock(session.localTiming).durationTicks;
        session.durationTicks = durationTicks;
        session.loopStartTick = 0;
        session.loopEndTick = durationTicks;
        session.cursorTick = clampTick(session.cursorTick, durationTicks);
      }
    });
  },
  setLocalTiming(key: string, timing: LocalPreviewTiming, now = monotonicNow()) {
    validateLocalTiming(timing);
    updateCommand(key, now, (session) => {
      if (session.scope === "arrangement") {
        throw new AuthoringTransportError(
          "AUTHORING_LOCAL_CLOCK_FORBIDDEN",
          "Arrangement timing belongs to its persisted TempoMap and TimeSignatureMap.",
          "Edit the Arrangement clock in its Inspector instead.",
        );
      }
      const loopCoveredDuration =
        session.loopStartTick === 0 && session.loopEndTick === session.durationTicks;
      session.localTiming = { ...timing };
      if (session.clockSource === "local") {
        const durationTicks = createLocalPreviewClock(timing).durationTicks;
        session.durationTicks = durationTicks;
        session.cursorTick = clampTick(session.cursorTick, durationTicks);
        if (loopCoveredDuration) session.loopEndTick = durationTicks;
      }
    });
  },
  publishCursor(key: string, cursorTick: number, ended = false) {
    const session = requiredSession(key);
    const next = {
      ...session,
      cursorTick: clampTick(cursorTick, session.durationTicks),
      playback: ended ? ("stopped" as const) : session.playback,
    };
    useAuthoringTransportStore.setState((state) => ({
      sessions: { ...state.sessions, [key]: next },
    }));
  },
  copySession(sourceKey: string, target: AuthoringSessionDefaults) {
    const source = useAuthoringTransportStore.getState().sessions[sourceKey];
    if (!source) return authoringTransportActions.ensureSession(target);
    const durationTicks = positiveInteger(target.durationTicks);
    const loopStartTick = Math.min(source.loopStartTick, durationTicks - 1);
    const session: AuthoringTransportSession = {
      ...source,
      key: target.key,
      scope: target.scope,
      durationTicks,
      cursorTick: Math.min(source.cursorTick, durationTicks),
      anchorTick: Math.min(source.cursorTick, durationTicks),
      loopStartTick,
      loopEndTick: Math.max(loopStartTick + 1, Math.min(source.loopEndTick, durationTicks)),
      commandRevision: source.commandRevision + 1,
    };
    useAuthoringTransportStore.setState((state) => ({
      sessions: { ...state.sessions, [target.key]: session },
    }));
    return session;
  },
  reset() {
    useAuthoringTransportStore.setState({ sessions: {} });
  },
};

export function authoringSessionKey(scope: AuthoringScope, assetKey: string) {
  return `${scope}:${assetKey}`;
}

export function createSession(defaults: AuthoringSessionDefaults): AuthoringTransportSession {
  const durationTicks = positiveInteger(defaults.durationTicks);
  const localTiming = { ...DEFAULT_LOCAL_TIMING, ...defaults.localTiming };
  validateLocalTiming(localTiming);
  return {
    key: defaults.key,
    scope: defaults.scope,
    playback: "stopped",
    cursorTick: 0,
    anchorTick: 0,
    anchorTimeMs: 0,
    durationTicks,
    loopEnabled: defaults.loopEnabled ?? defaults.scope !== "arrangement",
    loopStartTick: 0,
    loopEndTick: durationTicks,
    clockSource:
      defaults.scope === "arrangement" ? "arrangement" : (defaults.clockSource ?? "local"),
    localTiming,
    commandRevision: 0,
  };
}

function updateCommand(
  key: string,
  now: number,
  update: (session: AuthoringTransportSession) => void,
) {
  const current = requiredSession(key);
  const session = { ...current, localTiming: { ...current.localTiming } };
  update(session);
  session.anchorTick = session.cursorTick;
  session.anchorTimeMs = now;
  session.commandRevision += 1;
  useAuthoringTransportStore.setState((state) => ({
    sessions: { ...state.sessions, [key]: session },
  }));
}

function requiredSession(key: string) {
  const session = useAuthoringTransportStore.getState().sessions[key];
  if (!session) {
    throw new AuthoringTransportError(
      "AUTHORING_SESSION_MISSING",
      `Authoring transport session ${key} is not available.`,
      "Select the asset again to rebuild its PreviewSession.",
    );
  }
  return session;
}

function validateLocalTiming(timing: LocalPreviewTiming) {
  const denominatorIsPowerOfTwo =
    Number.isInteger(timing.denominator) &&
    timing.denominator > 0 &&
    (timing.denominator & (timing.denominator - 1)) === 0;
  if (
    !Number.isFinite(timing.bpm) ||
    timing.bpm < 1 ||
    timing.bpm > 1_000 ||
    !Number.isInteger(timing.numerator) ||
    timing.numerator < 1 ||
    timing.numerator > 32 ||
    !denominatorIsPowerOfTwo ||
    timing.denominator > 32 ||
    !Number.isInteger(timing.loopBars) ||
    timing.loopBars < 1 ||
    timing.loopBars > 256
  ) {
    throw new AuthoringTransportError(
      "AUTHORING_LOCAL_CLOCK_INVALID",
      "Local preview timing is outside the supported BPM, meter, or loop range.",
      "Use 1–1000 BPM, a 1–32 numerator, a power-of-two denominator up to 32, and 1–256 bars.",
    );
  }
}

function positiveInteger(value: number) {
  return Math.max(1, Math.floor(value));
}

function clampTick(value: number, durationTicks: number) {
  return Math.max(0, Math.min(Math.floor(value), durationTicks));
}

function monotonicNow() {
  return typeof performance === "undefined" ? 0 : performance.now();
}
