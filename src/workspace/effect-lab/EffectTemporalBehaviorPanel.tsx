import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Route } from "lucide-react";
import { engine } from "@/bridge/commands";
import type {
  AssetRef,
  EffectTempoBehaviorDSL,
  ProjectBundle,
  TemporalFingerprintReport,
  TemporalSpeedFingerprint,
} from "@/bridge/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatRate, primaryEventLabel } from "./temporalPresentation";

const COMPARISON_SPEEDS = [1, 4, 8] as const;

export function EffectTemporalBehaviorPanel({
  project,
  effectRef,
  behavior,
  targetSetId,
  bpm,
  selectedSpeed,
}: {
  project: ProjectBundle;
  effectRef: AssetRef;
  behavior: EffectTempoBehaviorDSL;
  targetSetId: string;
  bpm: number;
  selectedSpeed: number;
}) {
  const [report, setReport] = useState<TemporalFingerprintReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const speeds = useMemo(
    () => [...new Set([...COMPARISON_SPEEDS, selectedSpeed])].sort((a, b) => a - b),
    [selectedSpeed],
  );

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setError(null);
    void engine
      .analyzeEffectTemporal(project, {
        effect_ref: effectRef,
        target_set_id: targetSetId,
        bpm,
        speeds,
        seed: "effect-lab-preview-v1",
        sampling: {
          primary_event_window: 4,
          base_samples_per_beat: 64,
          minimum_samples_per_event: 16,
          preview_fps: 60,
        },
      })
      .then((next) => {
        if (!cancelled) setReport(next);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [bpm, effectRef.id, effectRef.revision, project, speeds, targetSetId]);

  const selected = report?.fingerprints.find((fingerprint) => fingerprint.speed === selectedSpeed);
  const selectedAliasing = selected?.aliasing;
  const eventLabel = primaryEventLabel(behavior.primary_event);

  return (
    <div className="border-border bg-muted/20 grid gap-2 rounded-md border p-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <Activity className="text-primary size-3.5 shrink-0" aria-hidden="true" />
        <p className="text-[10px] font-medium">Measured temporal behavior</p>
        <Badge variant="outline" className="ml-auto">
          Runtime analyzed
        </Badge>
      </div>

      {!report && !error && (
        <p className="text-muted-foreground text-[10px]">Rendering a dense musical-time sample…</p>
      )}
      {error && (
        <p className="text-destructive text-[10px]" role="alert">
          Temporal analysis unavailable: {error}
        </p>
      )}
      {report && (
        <>
          <div className="grid grid-cols-3 gap-1" aria-label="Measured speed comparison">
            {COMPARISON_SPEEDS.map((speed) => (
              <SpeedFingerprintCell
                key={speed}
                fingerprint={report.fingerprints.find((item) => item.speed === speed)}
                selected={speed === selectedSpeed}
                eventLabel={eventLabel}
              />
            ))}
          </div>
          {selected && (
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
              {selected.on_duty_cycle != null && (
                <span>{formatRate(selected.on_duty_cycle * 100)}% measured on-duty</span>
              )}
              {selected.spatial_centroid && (
                <span className="inline-flex items-center gap-1">
                  <Route className="size-3" aria-hidden="true" />
                  {formatRate(selected.spatial_centroid.path_distance)} path ·{" "}
                  {selected.spatial_centroid.direction_reversals} reversals
                </span>
              )}
              {selected.strobe && (
                <span>{formatRate(selected.strobe.maximum_fixture_flash_hz)} max fixture Hz</span>
              )}
            </div>
          )}
        </>
      )}

      {selectedAliasing && selectedAliasing.risk !== "none" && (
        <Alert variant={selectedAliasing.risk === "severe" ? "destructive" : "default"}>
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>
            {selectedAliasing.risk === "severe"
              ? "High-speed preview is undersampled"
              : "High-speed readability is limited"}
          </AlertTitle>
          <AlertDescription>
            At 60fps, {selectedSpeed}× has {formatRate(selectedAliasing.frames_per_primary_event)}{" "}
            frames per {eventLabel}
            {selectedAliasing.frames_per_on_window != null
              ? ` and ${formatRate(selectedAliasing.frames_per_on_window)} per on-window`
              : ""}
            . Use the measured 1×/4×/8× comparison and transport scrubbing to inspect phase
            landmarks.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function SpeedFingerprintCell({
  fingerprint,
  selected,
  eventLabel,
}: {
  fingerprint?: TemporalSpeedFingerprint;
  selected: boolean;
  eventLabel: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-background/60 grid min-w-0 gap-0.5 rounded border px-1.5 py-1",
        selected && "border-primary bg-primary/5",
      )}
    >
      <div className="flex items-center gap-1 text-[10px] font-medium">
        <span>{fingerprint?.speed ?? "—"}×</span>
        {selected && <span className="text-primary">Current</span>}
      </div>
      {fingerprint ? (
        <>
          <span className="text-muted-foreground truncate text-[9px]">
            {formatRate(fingerprint.primary_events_per_beat)} {eventLabel}/beat
          </span>
          <span className="text-muted-foreground text-[9px]">
            {formatRate(fingerprint.primary_events_per_second)}/s ·{" "}
            {formatRate(fingerprint.aliasing.frames_per_primary_event)} frames
          </span>
        </>
      ) : (
        <span className="text-muted-foreground text-[9px]">Analyzing…</span>
      )}
    </div>
  );
}
