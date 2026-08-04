import { useEffect, useMemo, useState } from "react";
import type { AssetRef } from "@/bridge/types";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { assetKey } from "@/document/projectModel";
import { AuthoringDiagnosticAlert } from "@/authoring/AuthoringDiagnosticAlert";
import { authoringDiagnostic, type AuthoringDiagnostic } from "@/authoring/diagnostics";
import {
  authoringSessionKey,
  authoringTransportActions,
  createSession,
  useAuthoringTransportStore,
} from "@/authoring/transport";

interface ArrangementLoopEditorProps {
  reference: AssetRef;
  durationTicks: number;
}

export function ArrangementLoopEditor({ reference, durationTicks }: ArrangementLoopEditorProps) {
  const key = authoringSessionKey("arrangement", assetKey(reference));
  const storedSession = useAuthoringTransportStore((state) => state.sessions[key]);
  const fallback = useMemo(
    () => createSession({ key, scope: "arrangement", durationTicks }),
    [durationTicks, key],
  );
  const session = storedSession ?? fallback;
  const [diagnostic, setDiagnostic] = useState<AuthoringDiagnostic | null>(null);

  useEffect(() => {
    authoringTransportActions.ensureSession({ key, scope: "arrangement", durationTicks });
  }, [durationTicks, key]);

  const updateLoop = (next: { enabled: boolean; startTick: number; endTick: number }) => {
    try {
      authoringTransportActions.setLoop(key, next);
      setDiagnostic(null);
    } catch (error) {
      setDiagnostic(authoringDiagnostic(error, "authoring.arrangement.loop"));
    }
  };

  return (
    <Field>
      <FieldLabel>Authoring loop</FieldLabel>
      <div className="grid grid-cols-2 gap-1.5">
        <Input
          aria-label="Loop start tick"
          type="number"
          min={0}
          value={session.loopStartTick}
          onChange={(event) =>
            updateLoop({
              enabled: session.loopEnabled,
              startTick: Number(event.target.value),
              endTick: session.loopEndTick,
            })
          }
        />
        <Input
          aria-label="Loop end tick"
          type="number"
          min={1}
          value={session.loopEndTick}
          onChange={(event) =>
            updateLoop({
              enabled: session.loopEnabled,
              startTick: session.loopStartTick,
              endTick: Number(event.target.value),
            })
          }
        />
      </div>
      <Button
        size="xs"
        variant={session.loopEnabled ? "secondary" : "outline"}
        aria-pressed={session.loopEnabled}
        onClick={() =>
          updateLoop({
            enabled: !session.loopEnabled,
            startTick: session.loopStartTick,
            endTick: session.loopEndTick,
          })
        }
      >
        Loop {session.loopEnabled ? "on" : "off"}
      </Button>
      {diagnostic && (
        <AuthoringDiagnosticAlert
          diagnostic={diagnostic}
          recoveryLabel="Use full Arrangement range"
          onRecover={() => updateLoop({ enabled: false, startTick: 0, endTick: durationTicks })}
        />
      )}
    </Field>
  );
}
