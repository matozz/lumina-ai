import { memo, useCallback, useEffect, useRef, useState } from "react";
import type {
  ArrangementAutomationLane as ArrangementAutomationLaneType,
  ArrangementDocument,
  KeyframeDSL,
  KeyframeInterpolationDSL,
  ParameterDefinitionDSL,
  ParameterValueDSL,
} from "@/bridge/types";
import {
  AutomationCurveSegment,
  updateAutomationCurveElement,
} from "@/panel/components/AutomationCurveSegment";
import {
  clampKeyframeDeltaToSnap,
  keyframeTransform,
  type KeyframeMoveBounds,
} from "@/panel/keyframeGeometry";
import {
  pointerDeltaWithScroll,
  snappedTickForPointerDelta,
  ticksToPixels,
  type TimelineGeometry,
} from "@/panel/timelineGeometry";
import type { TimelineViewport } from "@/panel/virtualization";
import { parameterAutomation, parameterInitialValue } from "@/document/effectParameter";
import { ArrangementKeyframeControl } from "./ArrangementKeyframeControl";
import {
  AutomationKeyframeContextMenu,
  AutomationLaneContextMenu,
} from "./ArrangementAutomationContextMenu";
import {
  arrangementSelectionHas,
  selectionAfterClick,
  type ArrangementKeyframeSelectionItem,
  type ArrangementSelectionItem,
  type ArrangementTimelineSelection,
} from "./arrangementSelection";
import { keyframeSelectionMoveBounds } from "./arrangementKeyframeProjection";
import {
  AUTOMATION_ROW_HEIGHT,
  AUTOMATION_VALUE_INSET,
  automationLaneValueAtTick,
} from "./arrangementTimelineModel";

interface ArrangementAutomationLaneProps {
  arrangement: ArrangementDocument;
  clipboardKind: "clips" | "keyframes" | "mixed" | null;
  definition: ParameterDefinitionDSL;
  geometry: TimelineGeometry;
  lane: ArrangementAutomationLaneType;
  onAdd: (tick: number, value: ParameterValueDSL, interpolation: KeyframeInterpolationDSL) => void;
  onCancelReady: (cancel: (() => void) | null) => void;
  onCopyItems: (items: ArrangementSelectionItem[]) => void;
  onDeleteItems: (items: ArrangementSelectionItem[]) => void;
  onDeleteKeyframes: (ids: string[]) => void;
  onDeleteLane: () => void;
  onMoveItems: (items: ArrangementSelectionItem[], deltaTick: number) => void;
  onPreviewItems: (items: ArrangementSelectionItem[], deltaTick: number) => void;
  onRegisterProjection: (
    trackId: string,
    laneId: string,
    project: ((selectedIds: ReadonlySet<string>, deltaTick: number) => void) | null,
  ) => void;
  onResetProjection: () => void;
  onPasteAt: (tick: number) => void;
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
  revealRequest: { keyframeId: string; laneId: string; nonce: number } | null;
}

interface KeyframeInteraction {
  anchorTick: number;
  bounds: KeyframeMoveBounds;
  currentClientX: number;
  deltaTick: number;
  items: ArrangementSelectionItem[];
  startClientX: number;
  startScrollLeft: number;
}

export const ArrangementAutomationLane = memo(function ArrangementAutomationLane({
  arrangement,
  clipboardKind,
  definition,
  geometry,
  lane,
  onAdd,
  onCancelReady,
  onCopyItems,
  onDeleteItems,
  onDeleteKeyframes,
  onDeleteLane,
  onMoveItems,
  onPreviewItems,
  onRegisterProjection,
  onResetProjection,
  onPasteAt,
  onSelectKeyframe,
  onSnapPreview,
  onUpdateKeyframe,
  viewport,
  viewportRef,
  selection,
  trackId,
  revealRequest,
}: ArrangementAutomationLaneProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const keyframeRefs = useRef(new Map<string, HTMLButtonElement>());
  const curveRefs = useRef(new Map<string, SVGSVGElement>());
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
  const selectedKeyframeItems = selection.items.filter(
    (item): item is ArrangementKeyframeSelectionItem => item.type === "keyframe",
  );

  const projectLane = useCallback(
    (ids: ReadonlySet<string>, deltaTick: number) => {
      const deltaPixels = ticksToPixels(deltaTick, geometry);
      for (const [id, element] of keyframeRefs.current) {
        element.style.transform = keyframeTransform(ids.has(id) ? deltaPixels : 0);
      }
      for (let index = 0; index < lane.keyframes.length - 1; index += 1) {
        const start = lane.keyframes[index];
        const end = lane.keyframes[index + 1];
        const element = curveRefs.current.get(`${start.id}\u0000${end.id}`);
        if (!element) continue;
        updateAutomationCurveElement(
          element,
          start,
          end,
          definition,
          arrangement.ppq,
          geometry.beatWidth,
          AUTOMATION_ROW_HEIGHT,
          AUTOMATION_VALUE_INSET,
          ids,
          deltaTick,
        );
      }
    },
    [arrangement.ppq, definition, geometry, lane.keyframes],
  );

  useEffect(() => {
    onRegisterProjection(trackId, lane.id, projectLane);
    return () => onRegisterProjection(trackId, lane.id, null);
  }, [lane.id, onRegisterProjection, projectLane, trackId]);

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
    interaction.deltaTick = clampKeyframeDeltaToSnap(
      requested,
      {
        minimum: Math.max(interaction.bounds.minimum, -interaction.anchorTick),
        maximum: Math.min(
          interaction.bounds.maximum,
          arrangement.length_ticks - 1 - interaction.anchorTick,
        ),
      },
      interaction.anchorTick,
      geometry.snapTicks,
    );
    onPreviewItems(interaction.items, interaction.deltaTick);
    onSnapPreview(interaction.anchorTick + interaction.deltaTick);
  };

  const finish = (commit: boolean) => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      flushPreview();
    }
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (interaction) onResetProjection();
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

  useEffect(() => {
    if (!revealRequest || revealRequest.laneId !== lane.id) return;
    const keyframe = lane.keyframes.find((candidate) => candidate.id === revealRequest.keyframeId);
    if (!keyframe) return;
    const viewportElement = viewportRef.current;
    if (viewportElement) {
      viewportElement.scrollLeft = Math.max(
        0,
        ticksToPixels(keyframe.time_tick, geometry) - viewportElement.clientWidth / 2,
      );
      if (rowRef.current) {
        viewportElement.scrollTop = Math.max(
          0,
          rowRef.current.offsetTop - viewportElement.clientHeight / 2,
        );
      }
    }
    requestAnimationFrame(() => keyframeRefs.current.get(keyframe.id)?.focus());
  }, [geometry, lane.id, lane.keyframes, revealRequest, viewportRef]);

  const addAt = (tick: number) => {
    const maximumGridTick =
      Math.floor((arrangement.length_ticks - 1) / geometry.snapTicks) * geometry.snapTicks;
    const snapped = Math.max(
      0,
      Math.min(
        maximumGridTick,
        snappedTickForPointerDelta(0, ticksToPixels(tick, geometry), geometry),
      ),
    );
    onAdd(
      snapped,
      automationLaneValueAtTick(lane, snapped, parameterInitialValue(definition)),
      parameterAutomation(definition) === "discrete" ? "hold" : "linear",
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
    <AutomationLaneContextMenu
      arrangementLength={arrangement.length_ticks}
      canCopyKeyframes={selectedKeyframeItems.length > 0}
      clipboardKind={clipboardKind}
      geometry={geometry}
      onAdd={addAt}
      onCancelReady={onCancelReady}
      onCopy={() => onCopyItems(selectedKeyframeItems)}
      onDeleteLane={onDeleteLane}
      onDeleteSelected={() => onDeleteItems(selectedKeyframeItems)}
      onPaste={onPasteAt}
      viewportRef={viewportRef}
    >
      <div
        ref={rowRef}
        className="border-border/60 relative h-8 border-b focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
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
              ref={(element) => {
                const segmentKey = `${keyframe.id}\u0000${lane.keyframes[index + 1].id}`;
                if (element) curveRefs.current.set(segmentKey, element);
                else curveRefs.current.delete(segmentKey);
              }}
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
          const item: ArrangementKeyframeSelectionItem = {
            type: "keyframe",
            trackId,
            laneId: lane.id,
            keyframeId: keyframe.id,
          };
          const contextItems = selected ? selectedKeyframeItems : [item];
          return (
            <AutomationKeyframeContextMenu
              key={keyframe.id}
              arrangementLength={arrangement.length_ticks}
              canCopyKeyframes={contextItems.length > 0}
              clipboardKind={clipboardKind}
              definition={definition}
              geometry={geometry}
              interpolation={keyframe.interpolation}
              onAdd={addAt}
              onCancelReady={onCancelReady}
              onContext={() => {
                if (!selected) onSelectKeyframe(item, { additive: false, toggle: false });
              }}
              onCopy={() => onCopyItems(contextItems)}
              onDeleteLane={onDeleteLane}
              onDeleteSelected={() => onDeleteItems(contextItems)}
              onEdit={() => setInspectorId(keyframe.id)}
              onInterpolation={(interpolation) => onUpdateKeyframe(keyframe.id, { interpolation })}
              onPaste={onPasteAt}
              viewportRef={viewportRef}
            >
              <ArrangementKeyframeControl
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
                onChooseNearby={(keyframeId) => {
                  onSelectKeyframe(
                    { type: "keyframe", trackId, laneId: lane.id, keyframeId },
                    { additive: false, toggle: false },
                  );
                  setInspectorId(keyframeId);
                }}
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
                  event.currentTarget.setPointerCapture(event.pointerId);
                  interactionRef.current = {
                    anchorTick: keyframe.time_tick,
                    bounds: keyframeSelectionMoveBounds(arrangement, gestureItems),
                    currentClientX: event.clientX,
                    deltaTick: 0,
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
            </AutomationKeyframeContextMenu>
          );
        })}
      </div>
    </AutomationLaneContextMenu>
  );
});
