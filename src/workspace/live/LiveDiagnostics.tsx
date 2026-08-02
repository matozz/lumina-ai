import { AlertTriangle, CircleGauge } from "lucide-react";
import { cn } from "@/lib/utils";
import { engineSelectors, useEngineStore } from "@/stores/engine";

export function LiveDiagnostics() {
  const outputRate = useEngineStore(engineSelectors.outputRateHz);
  const frameLag = useEngineStore(engineSelectors.frameLagMs);
  const adapter = useEngineStore(engineSelectors.outputAdapter);
  const lastError = useEngineStore(engineSelectors.lastOutputError);
  const liveRevision = useEngineStore(engineSelectors.liveShowRevision);
  const lagging = frameLag > 1_000 / outputRate;

  return (
    <section className="border-border rounded-md border p-2" aria-label="Live output diagnostics">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
        <CircleGauge className="size-3" aria-hidden="true" />
        Output diagnostics
      </div>
      <dl className="grid grid-cols-2 gap-1.5 text-[10px]">
        <Diagnostic label="FPS" value={`${outputRate} target`} />
        <Diagnostic label="Frame lag" value={`${frameLag.toFixed(1)} ms`} warning={lagging} />
        <Diagnostic label="Adapter" value={adapter} />
        <Diagnostic
          label="Show revision"
          value={liveRevision === null ? "—" : `r${liveRevision}`}
        />
      </dl>
      <div
        className={cn(
          "mt-1.5 flex items-start gap-1.5 rounded px-1.5 py-1 text-[10px]",
          lastError ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300",
        )}
      >
        <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        <span>{lastError ?? "No output errors"}</span>
      </div>
    </section>
  );
}

function Diagnostic({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded bg-zinc-950/60 px-1.5 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 truncate font-mono text-zinc-200", warning && "text-amber-300")}>
        {value}
      </dd>
    </div>
  );
}
