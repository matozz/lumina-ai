import { memo, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  ArrangementAutomationLane as ArrangementAutomationLaneType,
  ArrangementDocument,
  KeyframeDSL,
  KeyframeInterpolationDSL,
  ParameterDefinitionDSL,
  ParameterValueDSL,
} from "@/bridge/types";
import { Button } from "@/components/ui/button";
import { AutomationCurveSegment } from "@/panel/components/AutomationCurveSegment";
import {
  clampKeyframeDelta,
  keyframeMoveBounds,
  keyframeTransform,
} from "@/panel/keyframeGeometry";
import {
  pointerDeltaWithScroll,
  snappedTickForPointerDelta,
  ticksToPixels,
  type TimelineGeometry,
} from "@/panel/timelineGeometry";
import type { TimelineViewport } from "@/panel/virtualization";
import { ArrangementKeyframeControl } from "./ArrangementKeyframeControl";

interface ArrangementAutomationLaneProps {
  arrangement: ArrangementDocument;
  definition: ParameterDefinitionDSL;
  geometry: TimelineGeometry;
  lane: ArrangementAutomationLaneType;
  onAdd: (tick: number, value: ParameterValueDSL, interpolation: KeyframeInterpolationDSL) => void;
  onDeleteKeyframes: (ids: string[]) => void;
  onDeleteLane: () => void;
  onMoveKeyframes: (ids: string[], deltaTick: number) => void;
  onSnapPreview: (tick: number | null) => void;
  onUpdateKeyframe: (
    id: string,
    changes: Partial<Pick<KeyframeDSL, "time_tick" | "value" | "interpolation">>,
  ) => void;
  viewport: TimelineViewport;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}

interface KeyframeInteraction {
  anchorTick: number;
  bounds: ReturnType<typeof keyframeMoveBounds>;
  currentClientX: number;
  deltaTick: number;
  ids: string[];
  startClientX: number;
  startScrollLeft: number;
}

export const ArrangementAutomationLane = memo(function ArrangementAutomationLane({
  arrangement,
  definition,
  geometry,
  lane,
  onAdd,
  onDeleteKeyframes,
  onDeleteLane,
  onMoveKeyframes,
  onSnapPreview,
  onUpdateKeyframe,
  viewport,
  viewportRef,
}: ArrangementAutomationLaneProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const keyframeRefs = useRef(new Map<string, HTMLButtonElement>());
  const interactionRef = useRef<KeyframeInteraction | null>(null);
  const frameRef = useRef<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [inspectorId, setInspectorId] = useState<string | null>(null);

  useEffect(() => {
    const available = new Set(lane.keyframes.map((keyframe) => keyframe.id));
    setSelectedIds((current) => {
      const retained = new Set([...current].filter((id) => available.has(id)));
      return retained.size === current.size ? current : retained;
    });
  }, [lane.keyframes]);

  const flushPreview = () => {
    frameRef.current = null;
    const interaction = interactionRef.current;
    if (!interaction) return;
    const deltaPixels = pointerDeltaWithScroll(
      interaction.startClientX,
      interaction.currentClientX,
      interaction.startScrollLeft,
      viewportRef.current?.scrollLeft ?? interaction.startScrollLeft,
    );
    const requested =
      snappedTickForPointerDelta(interaction.anchorTick, deltaPixels, geometry) -
      interaction.anchorTick;
    interaction.deltaTick = clampKeyframeDelta(requested, {
      minimum: Math.max(interaction.bounds.minimum, -interaction.anchorTick),
      maximum: Math.min(
        interaction.bounds.maximum,
        arrangement.length_ticks - 1 - interaction.anchorTick,
      ),
    });
    const transform = keyframeTransform(ticksToPixels(interaction.deltaTick, geometry));
    for (const id of interaction.ids) {
      const element = keyframeRefs.current.get(id);
      if (element) element.style.transform = transform;
    }
    onSnapPreview(interaction.anchorTick + interaction.deltaTick);
  };

  const finish = (commit: boolean) => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      flushPreview();
    }
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (interaction) {
      for (const id of interaction.ids) {
        const element = keyframeRefs.current.get(id);
        if (element) element.style.transform = keyframeTransform(0);
      }
    }
    onSnapPreview(null);
    if (commit && interaction?.deltaTick) {
      onMoveKeyframes(interaction.ids, interaction.deltaTick);
    }
  };

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const addAt = (tick: number) => {
    const snapped = Math.max(
      0,
      Math.min(
        arrangement.length_ticks - 1,
        snappedTickForPointerDelta(0, ticksToPixels(tick, geometry), geometry),
      ),
    );
    if (lane.keyframes.some((keyframe) => keyframe.time_tick === snapped)) return;
    const previous = [...lane.keyframes].reverse().find((keyframe) => keyframe.time_tick < snapped);
    onAdd(
      snapped,
      structuredClone(previous?.value ?? definition.default_value),
      definition.automation === "discrete" ? "hold" : "linear",
    );
  };

  const visible = lane.keyframes.filter(
    (keyframe) =>
      keyframe.time_tick / arrangement.ppq >= viewport.startBeat - 1 &&
      keyframe.time_tick / arrangement.ppq <= viewport.endBeat + 1,
  );
  const visibleSegments = lane.keyframes.slice(0, -1).filter((keyframe, index) => {
    const next = lane.keyframes[index + 1];
    return (
      next.time_tick / arrangement.ppq >= viewport.startBeat &&
      keyframe.time_tick / arrangement.ppq <= viewport.endBeat
    );
  });

  return (
    <div
      ref={rowRef}
      className="border-border/60 group/lane relative h-10 border-b focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
      role="group"
      tabIndex={0}
      aria-label={`${definition.name} automation lane with ${lane.keyframes.length} keyframes`}
      data-lane-id={lane.id}
      onPointerMove={(event) => {
        if (!interactionRef.current) return;
        interactionRef.current.currentClientX = event.clientX;
        if (frameRef.current === null) frameRef.current = requestAnimationFrame(flushPreview);
      }}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
      onDoubleClick={(event) => {
        if (event.target !== event.currentTarget) return;
        addAt(
          ((event.clientX - event.currentTarget.getBoundingClientRect().left) /
            geometry.beatWidth) *
            arrangement.ppq,
        );
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          setSelectedIds(new Set(lane.keyframes.map((keyframe) => keyframe.id)));
        } else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          if (selectedIds.size > 0) onDeleteKeyframes([...selectedIds]);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          onMoveKeyframes(
            [...selectedIds],
            direction * (event.shiftKey ? arrangement.ppq : geometry.snapTicks),
          );
        }
      }}
    >
      {visibleSegments.map((keyframe) => {
        const index = lane.keyframes.findIndex((candidate) => candidate.id === keyframe.id);
        return (
          <AutomationCurveSegment
            key={`${keyframe.id}:${lane.keyframes[index + 1].id}`}
            start={keyframe}
            end={lane.keyframes[index + 1]}
            definition={definition}
            ppq={arrangement.ppq}
            beatWidth={geometry.beatWidth}
          />
        );
      })}
      {visible.map((keyframe) => {
        const selected = selectedIds.has(keyframe.id);
        return (
          <ArrangementKeyframeControl
            key={keyframe.id}
            arrangement={arrangement}
            definition={definition}
            geometry={geometry}
            inspectorOpen={inspectorId === keyframe.id}
            keyframe={keyframe}
            keyframes={lane.keyframes}
            selected={selected}
            onElement={(element) => {
              if (element) keyframeRefs.current.set(keyframe.id, element);
              else keyframeRefs.current.delete(keyframe.id);
            }}
            onInspectorOpenChange={(open) => setInspectorId(open ? keyframe.id : null)}
            onStartMove={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              const selection = event.shiftKey
                ? toggleSelection(selectedIds, keyframe.id)
                : selected
                  ? new Set(selectedIds)
                  : new Set([keyframe.id]);
              setSelectedIds(selection);
              event.currentTarget.setPointerCapture(event.pointerId);
              interactionRef.current = {
                anchorTick: keyframe.time_tick,
                bounds: keyframeMoveBounds(lane.keyframes, selection),
                currentClientX: event.clientX,
                deltaTick: 0,
                ids: [...selection],
                startClientX: event.clientX,
                startScrollLeft: viewportRef.current?.scrollLeft ?? 0,
              };
            }}
            onUpdate={(changes) => {
              onUpdateKeyframe(keyframe.id, changes);
              setInspectorId(null);
            }}
            onDelete={() => {
              onDeleteKeyframes([keyframe.id]);
              setInspectorId(null);
            }}
          />
        );
      })}
      <Button
        size="icon-xs"
        variant="ghost"
        className="absolute top-1 right-8 opacity-0 group-hover/lane:opacity-100 focus-visible:opacity-100"
        aria-label={`Add ${definition.name} keyframe at visible range start`}
        onClick={() => addAt((viewport.visibleStartBeat ?? viewport.startBeat) * arrangement.ppq)}
      >
        <Plus aria-hidden="true" />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        className="absolute top-1 right-1 opacity-0 group-hover/lane:opacity-100 focus-visible:opacity-100"
        aria-label={`Delete ${definition.name} automation lane`}
        onClick={onDeleteLane}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
});

function toggleSelection(selected: ReadonlySet<string>, id: string) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next.size > 0 ? next : new Set([id]);
}
