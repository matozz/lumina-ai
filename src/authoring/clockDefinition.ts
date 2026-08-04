import type { ArrangementDocument } from "@/bridge/types";
import { createLocalPreviewClock, type AuthoringClockDefinition } from "./musicalTime";
import type { AuthoringTransportSession } from "./transport";

export function arrangementClock(arrangement: ArrangementDocument): AuthoringClockDefinition {
  return {
    ppq: arrangement.ppq,
    tempoMap: arrangement.tempo_map,
    timeSignatures: arrangement.time_signatures,
    durationTicks: arrangement.length_ticks,
  };
}

export function clockForSession(
  session: AuthoringTransportSession,
  arrangement: ArrangementDocument,
): AuthoringClockDefinition {
  if (session.scope === "arrangement" || session.clockSource === "arrangement") {
    return arrangementClock(arrangement);
  }
  return createLocalPreviewClock(session.localTiming);
}
