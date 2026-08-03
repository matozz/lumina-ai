import { useMemo, useRef } from "react";
import { Copy, Plus, Redo2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assetKey, exactAsset, latestRefsById } from "@/document/projectModel";
import { cn } from "@/lib/utils";
import {
  createTimelineGeometry,
  pointerDeltaWithScroll,
  snappedTickForPointerDelta,
  ticksToPixels,
} from "@/panel/timelineGeometry";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";

const BEAT_WIDTH = 48;

interface DragState {
  pointerId: number;
  clipId: string;
  startTick: number;
  startClientX: number;
  startScrollLeft: number;
  nextTick: number;
  element: HTMLButtonElement;
}

export function CueTimelinePanel() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const reference = useProjectStore(projectSelectors.selectedArrangementRef);
  const selectedCueRef = useProjectStore(projectSelectors.selectedCueRef);
  const canUndo = useProjectStore(projectSelectors.canUndo);
  const canRedo = useProjectStore(projectSelectors.canRedo);
  const arrangementSessions = useProjectStore((state) => state.arrangementSessions);
  const arrangement = exactAsset(bundle.arrangements, reference);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const geometry = useMemo(
    () => createTimelineGeometry(arrangement?.ppq ?? 960, BEAT_WIDTH),
    [arrangement?.ppq],
  );
  if (!arrangement) return null;
  const width = Math.max(900, ticksToPixels(arrangement.length_ticks, geometry));
  const session = arrangementSessions[assetKey(reference)];
  const playheadTick = session?.playheadTick ?? 0;
  const arrangementItems = latestRefsById(bundle.manifest.arrangement_refs).map((candidate) => ({
    value: assetKey(candidate),
    label:
      exactAsset(bundle.arrangements, candidate)?.name ?? `${candidate.id} r${candidate.revision}`,
  }));

  const placeSelectedCue = () => {
    if (!selectedCueRef) return;
    const cue = exactAsset(bundle.cues, selectedCueRef);
    if (!cue) return;
    projectActions.updateArrangement(reference, `Place Cue ${cue.name}`, (document) => {
      const track = document.tracks[0];
      track.clips ??= [];
      const base = `${cue.id}-clip`;
      let id = base;
      let suffix = 2;
      while (document.tracks.some((item) => item.clips?.some((clip) => clip.id === id))) {
        id = `${base}-${suffix++}`;
      }
      track.clips.push({
        id,
        cue_ref: { ...selectedCueRef },
        start_tick: playheadTick,
        duration_tick: cue.nominal_length_ticks,
        source_offset_tick: 0,
        playback: "loop",
        layer: 0,
        layer_overrides: [],
      });
    });
  };

  return (
    <section className="bg-card flex h-full min-h-0 flex-col" aria-label="Cue timeline">
      <div className="border-border flex h-9 shrink-0 items-center gap-1.5 border-b px-2">
        <Select
          items={arrangementItems}
          value={assetKey(reference)}
          onValueChange={(value) => {
            const selected = latestRefsById(bundle.manifest.arrangement_refs).find(
              (candidate) => assetKey(candidate) === value,
            );
            if (selected) projectActions.selectArrangement(selected);
          }}
        >
          <SelectTrigger size="sm" className="min-w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {arrangementItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Badge variant="outline">r{arrangement.revision}</Badge>
        <Button size="xs" variant="ghost" onClick={() => projectActions.createArrangement()}>
          <Plus data-icon="inline-start" aria-hidden="true" />
          New
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => projectActions.duplicateArrangement(reference)}
        >
          <Copy data-icon="inline-start" aria-hidden="true" />
          Duplicate
        </Button>
        <Button size="xs" className="ml-auto" disabled={!selectedCueRef} onClick={placeSelectedCue}>
          <Plus data-icon="inline-start" aria-hidden="true" />
          Place selected Cue
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Undo Arrangement edit"
          disabled={!canUndo}
          onClick={projectActions.undo}
        >
          <Undo2 aria-hidden="true" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Redo Arrangement edit"
          disabled={!canRedo}
          onClick={projectActions.redo}
        >
          <Redo2 aria-hidden="true" />
        </Button>
      </div>
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto">
        <div className="relative min-h-full" style={{ width }}>
          <button
            type="button"
            aria-label="Seek Arrangement"
            className="border-border bg-muted/70 sticky top-0 block h-7 w-full cursor-crosshair border-b text-left"
            onPointerDown={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const tick = snappedTickForPointerDelta(0, event.clientX - rect.left, geometry);
              projectActions.setArrangementPlayhead(
                reference,
                Math.min(arrangement.length_ticks, tick),
              );
            }}
          >
            {Array.from(
              { length: Math.ceil(arrangement.length_ticks / arrangement.ppq / 4) + 1 },
              (_, index) => (
                <span
                  key={index}
                  className="text-muted-foreground absolute top-1 font-mono text-[9px]"
                  style={{ left: index * 4 * BEAT_WIDTH + 4 }}
                >
                  {index + 1}
                </span>
              ),
            )}
          </button>
          <div
            className="pointer-events-none absolute top-7 bottom-0 left-0 w-full"
            style={{
              backgroundImage:
                "linear-gradient(to right, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px)",
              backgroundSize: `${BEAT_WIDTH}px 100%`,
            }}
          />
          <div
            className="bg-primary pointer-events-none absolute top-0 bottom-0 w-px"
            style={{ left: ticksToPixels(playheadTick, geometry) }}
            aria-hidden="true"
          />
          <div className="relative flex min-h-full flex-col pt-1">
            {arrangement.tracks.map((track) => (
              <div key={track.id} className="border-border relative h-20 border-b">
                <span className="bg-card/90 text-muted-foreground sticky left-0 px-2 py-1 text-[10px]">
                  {track.name}
                </span>
                {track.clips?.map((clip) => {
                  const cue = exactAsset(bundle.cues, clip.cue_ref);
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      className={cn(
                        "border-primary/50 bg-primary text-primary-foreground absolute top-7 h-8 cursor-grab touch-none overflow-hidden rounded-md border px-2 text-left text-[10px] shadow-sm active:cursor-grabbing",
                        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                      )}
                      style={{
                        left: ticksToPixels(clip.start_tick, geometry),
                        width: Math.max(24, ticksToPixels(clip.duration_tick, geometry)),
                      }}
                      aria-label={`${cue?.name ?? clip.cue_ref.id}, starts at tick ${clip.start_tick}`}
                      onKeyDown={(event) => {
                        if (event.key === "Delete" || event.key === "Backspace") {
                          event.preventDefault();
                          projectActions.updateArrangement(
                            reference,
                            "Delete CueClip",
                            (document) => {
                              const owner = document.tracks.find((item) =>
                                item.clips?.some((candidate) => candidate.id === clip.id),
                              );
                              if (owner?.clips) {
                                owner.clips = owner.clips.filter(
                                  (candidate) => candidate.id !== clip.id,
                                );
                              }
                            },
                          );
                        }
                      }}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        dragRef.current = {
                          pointerId: event.pointerId,
                          clipId: clip.id,
                          startTick: clip.start_tick,
                          startClientX: event.clientX,
                          startScrollLeft: viewportRef.current?.scrollLeft ?? 0,
                          nextTick: clip.start_tick,
                          element: event.currentTarget,
                        };
                      }}
                      onPointerMove={(event) => {
                        const drag = dragRef.current;
                        if (!drag || drag.pointerId !== event.pointerId) return;
                        const delta = pointerDeltaWithScroll(
                          drag.startClientX,
                          event.clientX,
                          drag.startScrollLeft,
                          viewportRef.current?.scrollLeft ?? 0,
                        );
                        drag.nextTick = Math.min(
                          Math.max(0, arrangement.length_ticks - clip.duration_tick),
                          snappedTickForPointerDelta(drag.startTick, delta, geometry),
                        );
                        drag.element.style.transform = `translateX(${ticksToPixels(
                          drag.nextTick - drag.startTick,
                          geometry,
                        )}px)`;
                      }}
                      onPointerUp={(event) => {
                        const drag = dragRef.current;
                        if (!drag || drag.pointerId !== event.pointerId) return;
                        drag.element.style.transform = "";
                        dragRef.current = null;
                        if (drag.nextTick === drag.startTick) return;
                        projectActions.updateArrangement(reference, "Move CueClip", (document) => {
                          const moved = document.tracks
                            .flatMap((item) => item.clips ?? [])
                            .find((candidate) => candidate.id === drag.clipId);
                          if (moved) moved.start_tick = drag.nextTick;
                        });
                      }}
                    >
                      <span className="block truncate font-medium">
                        {cue?.name ?? clip.cue_ref.id}
                      </span>
                      <span className="block truncate opacity-75">
                        Cue r{clip.cue_ref.revision} · {clip.duration_tick} t
                      </span>
                    </button>
                  );
                })}
                {track.automation_lanes?.flatMap((lane) =>
                  lane.keyframes.map((keyframe) => (
                    <span
                      key={`${lane.id}:${keyframe.id}`}
                      className="bg-foreground absolute bottom-2 size-2 rotate-45"
                      style={{ left: ticksToPixels(keyframe.time_tick, geometry) - 4 }}
                      title={`${lane.id} · ${keyframe.time_tick} ticks`}
                    />
                  )),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
