import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCw } from "lucide-react";
import { engine } from "@/bridge/commands";
import type { FixtureFramePayload } from "@/bridge/types";
import { CanvasView } from "@/canvas/CanvasView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { engineSelectors, useEngineStore } from "@/stores/engine";
import { useWorkspaceStore, workspaceSelectors } from "@/stores/workspace";
import { primaryInstance } from "./effectFactory";

export function EffectLabPreview() {
  const document = useEngineStore(engineSelectors.parsedDsl);
  const selectedEffectId = useWorkspaceStore(workspaceSelectors.selectedEffectId);
  const [playing, setPlaying] = useState(true);
  const [status, setStatus] = useState<"idle" | "rendering" | "ready" | "error">("idle");
  const [activeVariant, setActiveVariant] = useState<"A" | "B">("B");
  const [canCompare, setCanCompare] = useState(false);
  const framesRef = useRef<FixtureFramePayload[][]>([]);
  const aFramesRef = useRef<FixtureFramePayload[][]>([]);
  const bFramesRef = useRef<FixtureFramePayload[][]>([]);
  const lastEffectRef = useRef<{ id: string; revision: number } | null>(null);
  const playingRef = useRef(playing);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const scrubbingRef = useRef(false);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    if (!document || !selectedEffectId) {
      framesRef.current = [];
      setStatus("idle");
      return;
    }
    const instance = primaryInstance(document, selectedEffectId);
    const definition = document.effect_definitions.find((effect) => effect.id === selectedEffectId);
    if (!instance || !definition) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setStatus("rendering");
      void engine
        .previewEffectLoop(JSON.stringify(document), instance.id)
        .then((frames) => {
          if (cancelled) return;
          const previous = lastEffectRef.current;
          if (previous?.id === selectedEffectId && previous.revision !== definition.revision) {
            aFramesRef.current = bFramesRef.current;
            bFramesRef.current = frames;
            setCanCompare(aFramesRef.current.length > 0);
          } else {
            aFramesRef.current = frames;
            bFramesRef.current = frames;
            setCanCompare(false);
          }
          lastEffectRef.current = { id: selectedEffectId, revision: definition.revision };
          framesRef.current = bFramesRef.current;
          setActiveVariant("B");
          if (frames[0]) dispatchFrame(frames[0]);
          setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [document, selectedEffectId]);

  useEffect(() => {
    let request = 0;
    let previousFrame = -1;
    const startedAt = performance.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = (now: number) => {
      const frames = framesRef.current;
      if (playingRef.current && frames.length > 0 && !reducedMotion && !scrubbingRef.current) {
        const bpm = document?.timeline?.tempo_map.points[0]?.bpm ?? 120;
        const barDuration = (4 * 60 * 1000) / bpm;
        const progress = ((now - startedAt) % barDuration) / barDuration;
        const frameIndex = Math.floor(progress * frames.length) % frames.length;
        if (frameIndex !== previousFrame) {
          previousFrame = frameIndex;
          dispatchFrame(frames[frameIndex]);
        }
        if (indicatorRef.current) indicatorRef.current.style.transform = `scaleX(${progress})`;
        if (scrubRef.current) scrubRef.current.value = String(progress * 100);
      }
      request = requestAnimationFrame(animate);
    };
    request = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(request);
  }, [document]);

  const selectVariant = (variant: "A" | "B") => {
    const frames = variant === "A" ? aFramesRef.current : bFramesRef.current;
    if (frames.length === 0) return;
    framesRef.current = frames;
    setActiveVariant(variant);
    const progress = Number(scrubRef.current?.value ?? 0) / 100;
    dispatchFrame(frames[Math.min(frames.length - 1, Math.floor(progress * frames.length))]);
  };

  const scrubPreview = (value: number) => {
    const frames = framesRef.current;
    if (frames.length === 0) return;
    const progress = Math.max(0, Math.min(value / 100, 0.999_999));
    dispatchFrame(frames[Math.floor(progress * frames.length)]);
    if (indicatorRef.current) indicatorRef.current.style.transform = `scaleX(${progress})`;
  };

  return (
    <section className="bg-background relative flex h-full min-h-0 flex-col">
      <div className="border-border bg-card/70 flex h-8 shrink-0 items-center gap-2 border-b px-2.5">
        <RotateCw className="text-primary size-3.5" aria-hidden="true" />
        <span className="text-xs font-medium">One-bar loop preview</span>
        <Badge variant="outline">Draft only</Badge>
        <span className="text-muted-foreground ml-auto text-[10px]" aria-live="polite">
          {statusLabel(status)}
        </span>
        <div
          className="border-border flex rounded border p-0.5"
          aria-label="Effect revision comparison"
        >
          {(["A", "B"] as const).map((variant) => (
            <Button
              key={variant}
              variant="ghost"
              size="icon-xs"
              aria-label={`Preview revision ${variant}`}
              aria-pressed={activeVariant === variant}
              disabled={variant === "A" && !canCompare}
              className={cn(activeVariant === variant && "bg-primary/20 text-primary")}
              onClick={() => selectVariant(variant)}
            >
              {variant}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={playing ? "Pause effect loop preview" : "Play effect loop preview"}
          onClick={() => setPlaying((current) => !current)}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
      </div>
      <input
        ref={scrubRef}
        type="range"
        min="0"
        max="100"
        step="0.1"
        defaultValue="0"
        aria-label="Scrub effect loop"
        className="accent-primary bg-muted h-1 w-full shrink-0 cursor-ew-resize appearance-none"
        onPointerDown={() => {
          scrubbingRef.current = true;
        }}
        onPointerUp={() => {
          scrubbingRef.current = false;
        }}
        onInput={(event) => scrubPreview(Number(event.currentTarget.value))}
      />
      <div className="relative min-h-0 flex-1">
        <CanvasView />
        {status === "idle" && (
          <div className="bg-background/75 absolute inset-0 flex items-center justify-center backdrop-blur-sm">
            <p className="text-muted-foreground text-xs">Create or select an effect to preview.</p>
          </div>
        )}
      </div>
      <div className="bg-muted h-1 shrink-0 overflow-hidden" aria-hidden="true">
        <div ref={indicatorRef} className="bg-primary h-full origin-left scale-x-0" />
      </div>
    </section>
  );
}

function dispatchFrame(frame: FixtureFramePayload[]) {
  window.dispatchEvent(new CustomEvent("workspace:test-fixtures", { detail: frame }));
}

function statusLabel(status: "idle" | "rendering" | "ready" | "error") {
  return {
    idle: "No effect selected",
    rendering: "Rendering preview…",
    ready: "Renderer synced",
    error: "Preview unavailable",
  }[status];
}
