import { useEffect, useState } from "react";
import { Activity, Route } from "lucide-react";
import { engine } from "@/bridge/commands";
import type {
  AssetRef,
  EffectTempoBehaviorDSL,
  ProjectBundle,
  TemporalFingerprintReport,
} from "@/bridge/types";
import { formatRate, primaryEventLabel } from "./temporalPresentation";

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
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setUnavailable(false);
    void engine
      .analyzeEffectTemporal(project, {
        effect_ref: effectRef,
        target_set_id: targetSetId,
        bpm,
        speeds: [selectedSpeed],
        seed: "effec7ab00000001",
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
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bpm, effectRef.id, effectRef.revision, project, selectedSpeed, targetSetId]);

  const selected = report?.fingerprints.find((fingerprint) => fingerprint.speed === selectedSpeed);
  const eventLabel = primaryEventLabel(behavior.primary_event);

  return (
    <div
      className="border-border bg-muted/20 flex min-w-0 flex-col gap-1.5 rounded-md border p-2.5"
      aria-label="Current temporal analysis"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Activity className="text-primary size-3.5 shrink-0" aria-hidden="true" />
        <p className="text-[10px] font-medium">Current behavior</p>
      </div>

      {!report && !unavailable && (
        <p className="text-muted-foreground text-[10px]">Analyzing current speed…</p>
      )}
      {unavailable && (
        <p className="text-muted-foreground text-[10px]">Current analysis unavailable.</p>
      )}
      {selected && (
        <>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[10px]">
            <span className="font-medium">{selected.speed}×</span>
            <span className="text-muted-foreground">
              {formatRate(selected.primary_events_per_beat)} {eventLabel}/beat ·{" "}
              {formatRate(selected.primary_events_per_second)} events/s
            </span>
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
            {selected.on_duty_cycle != null && (
              <span>{formatRate(selected.on_duty_cycle * 100)}% on</span>
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
        </>
      )}
    </div>
  );
}
