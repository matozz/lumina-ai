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
import {
  arrangementSelectionHas,
  selectionAfterClick,
  type ArrangementKeyframeSelectionItem,
  type ArrangementSelectionItem,
  type ArrangementTimelineSelection,
} from "./arrangementSelection";
import { AUTOMATION_ROW_HEIGHT, AUTOMATION_VALUE_INSET } from "./arrangementTimelineModel";

interface ArrangementAutomationLaneProps {
  arrangement: ArrangementDocument;
  definition: ParameterDefinitionDSL;
  geometry: TimelineGeometry;
  lane: ArrangementAutomationLaneType;
  onAdd: (tick: number, value: ParameterValueDSL, interpolation: KeyframeInterpolationDSL) => void;
  onCancelReady: (cancel: (() => void) | null) => void;
  onDeleteKeyframes: (ids: string[]) => void;
  onDeleteLane: () => void;
  onMoveItems: (items: ArrangementSelectionItem[], deltaTick: number) => void;
  onSelectKeyframe: (
    item: ArrangementKeyframeSelectionItem,
    modifiers: { additive: boolean; toggle: boolean },
  ) => void;
  onSnapPreview: (tick: number | null) => void;
  onUpdateKeyframe: (
    id: string,
    changes: Partial<Pick<KeyframeDSL, "time_tick" | "value" | "interpolation">>,
  ) => void;
  viewport: TimelineViewport;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  selection: ArrangementTimelineSelection;
  trackId: string;
}

interface KeyframeInteraction {
  anchorTick: number;
  bounds: ReturnType<typeof keyframeMoveBounds>;
  currentClientX: number;
  deltaTick: number;
  ids: string[];
  items: ArrangementSelectionItem[];
  startClientX: number;
  startScrollLeft: number;
}

export const ArrangementAutomationLane = memo(function ArrangementAutomationLane({
  arrangement,
  definition,
  geometry,
  lane,
  onAdd,
  onCancelReady,
  onDeleteKeyframes,
  onDeleteLane,
  onMoveItems,
  onSelectKeyframe,
  onSnapPreview,
  onUpdateKeyframe,
  viewport,
  viewportRef,
  selection,
  trackId,
}: ArrangementAutomationLaneProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const keyframeRefs = useRef(new Map<string, HTMLButtonElement>());
  const interactionRef = useRef<KeyframeInteraction | null>(null);
  const frameRef = useRef<number | null>(null);
  const [inspectorId, setInspectorId] = useState<string | null>(null);
  const selectedIds = new Set(
    lane.keyframes
      .filter((keyframe) =>
        arrangementSelectionHas(selection, {
          type: "keyframe",
          trackId,
          laneId: lane.id,
          keyframeId: keyframe.id,
        }),
      )
      .map((keyframe) => keyframe.id),
  );

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
    onCancelReady(null);
    if (commit && interaction?.deltaTick) {
      onMoveItems(interaction.items, interaction.deltaTick);
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
            height={AUTOMATION_ROW_HEIGHT}
            valueInset={AUTOMATION_VALUE_INSET}
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
            rowHeight={AUTOMATION_ROW_HEIGHT}
            selected={selected}
            valueInset={AUTOMATION_VALUE_INSET}
            onElement={(element) => {
              if (element) keyframeRefs.current.set(keyframe.id, element);
              else keyframeRefs.current.delete(keyframe.id);
            }}
            onInspectorOpenChange={(open) => setInspectorId(open ? keyframe.id : null)}
            onStartMove={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              const item: ArrangementKeyframeSelectionItem = {
                type: "keyframe",
                trackId,
                laneId: lane.id,
                keyframeId: keyframe.id,
              };
              const modifiers = {
                additive: event.shiftKey,
                toggle: event.metaKey || event.ctrlKey,
              };
              const gestureSelection = selectionAfterClick(selection, item, modifiers);
              onSelectKeyframe(item, modifiers);
              if (modifiers.toggle) return;
              const gestureItems = gestureSelection.items.filter(
                (candidate) => candidate.type === "keyframe",
              );
              const laneIds = new Set(
                gestureItems
                  .filter(
                    (candidate) => candidate.type === "keyframe" && candidate.laneId === lane.id,
                  )
                  .map((candidate) => candidate.keyframeId),
              );
              event.currentTarget.setPointerCapture(event.pointerId);
              interactionRef.current = {
                anchorTick: keyframe.time_tick,
                bounds: keyframeMoveBounds(lane.keyframes, laneIds),
                currentClientX: event.clientX,
                deltaTick: 0,
                ids: [...laneIds],
                items: gestureItems,
                startClientX: event.clientX,
                startScrollLeft: viewportRef.current?.scrollLeft ?? 0,
              };
              onCancelReady(() => finish(false));
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
