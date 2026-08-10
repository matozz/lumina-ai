import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Repeat2, Square } from "lucide-react";
import type { ArrangementDocument, AssetRef } from "@/bridge/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { assetKey } from "@/document/projectModel";
import { cn } from "@/lib/utils";
import { useWorkspaceStore, workspaceSelectors } from "@/stores/workspace";
import { AuthoringDiagnosticAlert } from "./AuthoringDiagnosticAlert";
import { clockForSession } from "./clockDefinition";
import { authoringDiagnostic, type AuthoringDiagnostic } from "./diagnostics";
import { LocalPreviewTimingFields } from "./LocalPreviewTimingFields";
import { currentBpm, formatMusicalPosition, musicalPositionAtTick } from "./musicalTime";
import {
  authoringSessionKey,
  authoringTransportActions,
  createSession,
  DEFAULT_AUTHORING_LOCAL_TIMING,
  type AuthoringScope,
  useAuthoringTransportStore,
} from "./transport";

interface AuthoringTransportBarProps {
  scope: AuthoringScope;
  reference: AssetRef;
  arrangement: ArrangementDocument;
  disabled?: boolean;
  className?: string;
}

export function AuthoringTransportBar({
  scope,
  reference,
  arrangement,
  disabled = false,
  className,
}: AuthoringTransportBarProps) {
  const key = authoringSessionKey(scope, assetKey(reference));
  const advancedMode = useWorkspaceStore(workspaceSelectors.advancedMode);
  const storedSession = useAuthoringTransportStore((state) => state.sessions[key]);
  const fallback = useMemo(
    () =>
      createSession({
        key,
        scope,
        durationTicks: arrangement.length_ticks,
        clockSource: scope === "arrangement" ? "arrangement" : "local",
      }),
    [arrangement.length_ticks, key, scope],
  );
  const session = storedSession ?? fallback;
  const clock = useMemo(() => clockForSession(session, arrangement), [arrangement, session]);
  const [diagnostic, setDiagnostic] = useState<AuthoringDiagnostic | null>(null);
  const position = musicalPositionAtTick(
    Math.min(session.cursorTick, clock.durationTicks),
    clock.ppq,
    clock.timeSignatures,
  );
  const bpm = currentBpm(clock.tempoMap, session.cursorTick);

  useEffect(() => {
    authoringTransportActions.ensureSession({
      key,
      scope,
      durationTicks: clock.durationTicks,
      clockSource: scope === "arrangement" ? "arrangement" : session.clockSource,
      localTiming: session.localTiming,
    });
  }, [clock.durationTicks, key, scope, session.clockSource, session.localTiming]);

  useEffect(() => {
    if (storedSession && storedSession.durationTicks !== clock.durationTicks) {
      authoringTransportActions.configureDuration(key, clock.durationTicks);
    }
  }, [clock.durationTicks, key, storedSession]);

  const run = (action: () => void, path: string) => {
    try {
      authoringTransportActions.ensureSession({
        key,
        scope,
        durationTicks: clock.durationTicks,
        clockSource: session.clockSource,
        localTiming: session.localTiming,
      });
      action();
      setDiagnostic(null);
    } catch (error) {
      setDiagnostic(authoringDiagnostic(error, path));
    }
  };

  const updateLocalTiming = (
    field: "bpm" | "numerator" | "denominator" | "loopBars",
    value: number,
  ) =>
    run(
      () =>
        authoringTransportActions.setLocalTiming(key, {
          ...session.localTiming,
          [field]: value,
        }),
      `authoring.${scope}.local_timing.${field}`,
    );

  return (
    <div className={cn("border-border bg-card/80 shrink-0 border-b", className)}>
      <div className="flex min-h-9 items-center gap-1.5 px-2.5 py-1">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={
            session.playback === "playing" ? "Pause authoring preview" : "Play authoring preview"
          }
          disabled={disabled}
          onClick={() =>
            run(
              () =>
                session.playback === "playing"
                  ? authoringTransportActions.pause(key)
                  : authoringTransportActions.play(key),
              `authoring.${scope}.transport`,
            )
          }
        >
          {session.playback === "playing" ? (
            <Pause aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Stop authoring preview"
          disabled={disabled}
          onClick={() =>
            run(() => authoringTransportActions.stop(key), `authoring.${scope}.transport`)
          }
        >
          <Square aria-hidden="true" />
        </Button>
        <Button
          variant={session.loopEnabled ? "secondary" : "ghost"}
          size="icon-xs"
          aria-label={session.loopEnabled ? "Disable authoring loop" : "Enable authoring loop"}
          aria-pressed={session.loopEnabled}
          disabled={disabled}
          onClick={() =>
            run(
              () =>
                authoringTransportActions.setLoop(key, {
                  enabled: !session.loopEnabled,
                  startTick: session.loopStartTick,
                  endTick: Math.min(session.loopEndTick, clock.durationTicks),
                }),
              `authoring.${scope}.loop`,
            )
          }
        >
          <Repeat2 aria-hidden="true" />
        </Button>

        <Badge variant="outline" className="w-18 justify-center font-mono tabular-nums">
          {bpm.toFixed(bpm % 1 === 0 ? 0 : 2)} BPM
        </Badge>
        <Badge variant="outline" className="w-10 justify-center font-mono tabular-nums">
          {position.numerator}/{position.denominator}
        </Badge>
        <Badge
          variant="secondary"
          className="w-18 justify-center font-mono tabular-nums"
          aria-label="Musical position"
        >
          {formatMusicalPosition(position, clock.ppq)}
        </Badge>

        <div
          className="border-border bg-muted/40 flex h-5 w-14 shrink-0 items-center justify-center gap-1 rounded-4xl border px-1.5"
          aria-label={`Beat ${position.beat} of ${position.numerator}`}
        >
          {position.numerator <= 8 ? (
            Array.from({ length: position.numerator }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "bg-muted-foreground/30 size-1.5 rounded-full",
                  index + 1 === position.beat && "bg-primary",
                  index === 0 && "ring-border ring-1",
                )}
                aria-hidden="true"
              />
            ))
          ) : (
            <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
              {position.beat}/{position.numerator}
            </span>
          )}
        </div>

        {advancedMode && scope !== "arrangement" && (
          <ToggleGroup
            className="ml-auto"
            variant="outline"
            size="sm"
            value={[session.clockSource]}
            onValueChange={(value) => {
              const source = value[0];
              if (source === "local" || source === "arrangement") {
                run(
                  () => authoringTransportActions.setClockSource(key, source),
                  `authoring.${scope}.clock_source`,
                );
              }
            }}
            aria-label="Preview clock source"
          >
            <ToggleGroupItem value="local">Local</ToggleGroupItem>
            <ToggleGroupItem value="arrangement">Follow Arrangement</ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      <div className="border-border flex min-h-8 items-center gap-2 border-t px-2.5 py-1">
        <Slider
          aria-label={`Seek ${scope} authoring preview`}
          min={0}
          max={Math.max(1, clock.durationTicks)}
          step={1}
          value={[Math.min(session.cursorTick, clock.durationTicks)]}
          disabled={disabled}
          onValueChange={(value) => {
            const cursor = Array.isArray(value) ? (value[0] ?? 0) : value;
            run(
              () => authoringTransportActions.seek(key, cursor),
              `authoring.${scope}.transport.seek`,
            );
          }}
        />
        <span className="text-muted-foreground w-24 text-right text-[10px] tabular-nums">
          {advancedMode
            ? `${session.cursorTick} ticks`
            : `Bar ${position.bar} · Beat ${position.beat}`}
        </span>

        {advancedMode && scope !== "arrangement" && session.clockSource === "local" && (
          <LocalPreviewTimingFields
            sessionKey={key}
            timing={session.localTiming}
            onCommit={updateLocalTiming}
          />
        )}
      </div>

      {diagnostic && (
        <AuthoringDiagnosticAlert
          diagnostic={diagnostic}
          onRecover={() => {
            run(() => {
              if (scope !== "arrangement") {
                authoringTransportActions.setLocalTiming(key, {
                  ...DEFAULT_AUTHORING_LOCAL_TIMING,
                });
              }
              authoringTransportActions.setLoop(key, {
                enabled: scope !== "arrangement",
                startTick: 0,
                endTick: Math.max(1, clock.durationTicks),
              });
            }, `authoring.${scope}.recovery`);
          }}
        />
      )}
    </div>
  );
}
