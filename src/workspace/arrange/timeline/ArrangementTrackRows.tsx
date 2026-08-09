import { useCallback, useRef } from "react";
import type { ArrangementDocument, ProjectBundle } from "@/bridge/types";
import { exactAsset } from "@/document/projectModel";
import type { TimelineGeometry } from "@/panel/timelineGeometry";
import type { TimelineViewport } from "@/panel/virtualization";
import { ArrangementAutomationLane } from "./ArrangementAutomationLane";
import { CueClipBlock } from "./CueClipBlock";
import { CueClipContextMenu, CueRowContextMenu } from "./ArrangementTimelineContextMenu";
import {
  addAutomationKeyframe,
  CUE_TRACK_PADDING,
  CUE_TRACK_ROW_PITCH,
  cueTrackVisualLayout,
  deleteAutomationKeyframes,
  deleteAutomationLane,
  automationOptionsForClip,
  resolveAutomationOption,
  updateAutomationKeyframe,
  visibleCueClips,
} from "./arrangementTimelineModel";
import {
  arrangementSelectionHas,
  type ArrangementKeyframeSelectionItem,
  type ArrangementSelectionItem,
  type ArrangementTimelineSelection,
} from "./arrangementSelection";
import {
  emptyKeyframeProjectionIds,
  keyframeLaneKey,
  projectRegisteredKeyframeLanes,
} from "./arrangementKeyframeProjection";

export type RunArrangementCommand = (
  label: string,
  path: string,
  update: (draft: ArrangementDocument) => void,
) => void;

interface ArrangementTrackRowsProps {
  arrangement: ArrangementDocument;
  bundle: ProjectBundle;
  canPlaceCue: boolean;
  clipboardKind: "clips" | "keyframes" | "mixed" | null;
  geometry: TimelineGeometry;
  onCancelReady: (cancel: (() => void) | null) => void;
  onCopyItems: (items: ArrangementSelectionItem[]) => void;
  onDeleteItems: (items: ArrangementSelectionItem[]) => void;
  onDuplicateItems: (items: ArrangementSelectionItem[]) => void;
  onEnsureAutomation: (
    trackId: string,
    option: ReturnType<typeof automationOptionsForClip>[number],
    tick: number,
  ) => void;
  onPasteAt: (tick: number) => void;
  onPlaceCueAt: (tick: number) => void;
  onSnapPreview: (tick: number | null) => void;
  runCommand: RunArrangementCommand;
  revealRequest: { keyframeId: string; laneId: string; nonce: number } | null;
  selection: ArrangementTimelineSelection;
  onMoveItems: (items: ArrangementSelectionItem[], deltaTick: number) => void;
  onResizeItems: (items: ArrangementSelectionItem[], deltaTick: number) => void;
  onSelectItem: (
    item: ArrangementSelectionItem,
    modifiers: { additive: boolean; toggle: boolean },
  ) => void;
  viewport: TimelineViewport;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}

export function ArrangementTrackRows({
  arrangement,
  bundle,
  canPlaceCue,
  clipboardKind,
  geometry,
  onCancelReady,
  onCopyItems,
  onDeleteItems,
  onDuplicateItems,
  onEnsureAutomation,
  onPasteAt,
  onPlaceCueAt,
  onSnapPreview,
  runCommand,
  revealRequest,
  selection,
  onMoveItems,
  onResizeItems,
  onSelectItem,
  viewport,
  viewportRef,
}: ArrangementTrackRowsProps) {
  const projectionControllers = useRef(
    new Map<string, (selectedIds: ReadonlySet<string>, deltaTick: number) => void>(),
  );
  const registerProjection = useCallback(
    (
      trackId: string,
      laneId: string,
      project: ((selectedIds: ReadonlySet<string>, deltaTick: number) => void) | null,
    ) => {
      const key = keyframeLaneKey(trackId, laneId);
      if (project) projectionControllers.current.set(key, project);
      else projectionControllers.current.delete(key);
    },
    [],
  );
  const previewItems = useCallback((items: ArrangementSelectionItem[], deltaTick: number) => {
    projectRegisteredKeyframeLanes(projectionControllers.current, items, deltaTick);
  }, []);
  const resetProjection = useCallback(() => {
    for (const project of projectionControllers.current.values()) {
      project(emptyKeyframeProjectionIds(), 0);
    }
  }, []);

  return arrangement.tracks.map((track) => {
    const clips = track.clips ?? [];
    const layout = cueTrackVisualLayout(clips);
    return (
      <div key={track.id}>
        <CueRowContextMenu
          arrangementLength={arrangement.length_ticks}
          canPlaceCue={canPlaceCue}
          clipboardKind={clipboardKind}
          geometry={geometry}
          onCancelReady={onCancelReady}
          onPaste={onPasteAt}
          onPlaceCue={onPlaceCueAt}
          viewportRef={viewportRef}
        >
          <div
            className="border-border relative border-b"
            style={{ height: layout.height }}
            data-cue-row-count={layout.rowCount}
            data-track-id={track.id}
          >
            {visibleCueClips(
              clips,
              viewport.startBeat * arrangement.ppq,
              viewport.endBeat * arrangement.ppq,
            ).map((clip) => {
              const selectionItem = { type: "clip" as const, trackId: track.id, clipId: clip.id };
              const placement = layout.placements.get(clip.id) ?? {
                row: 0,
                semanticLayer: clip.layer ?? 0,
                subrow: 0,
              };
              const selected = arrangementSelectionHas(selection, selectionItem);
              const contextItems = selected ? selection.items : [selectionItem];
              return (
                <CueClipContextMenu
                  key={clip.id}
                  arrangementLength={arrangement.length_ticks}
                  arrangement={arrangement}
                  geometry={geometry}
                  onCancelReady={onCancelReady}
                  onAutomation={(option, tick) => onEnsureAutomation(track.id, option, tick)}
                  onContext={() => {
                    if (!selected) onSelectItem(selectionItem, { additive: false, toggle: false });
                  }}
                  onCopy={() => onCopyItems(contextItems)}
                  onDelete={() => onDeleteItems(contextItems)}
                  onDuplicate={() => onDuplicateItems(contextItems)}
                  options={automationOptionsForClip(bundle, arrangement, clip.id)}
                  stopPropagation
                  viewportRef={viewportRef}
                >
                  <CueClipBlock
                    clip={clip}
                    cueName={exactAsset(bundle.cues, clip.cue_ref)?.name ?? clip.cue_ref.id}
                    geometry={geometry}
                    selected={selected}
                    top={CUE_TRACK_PADDING + placement.row * CUE_TRACK_ROW_PITCH}
                    visualRow={placement.row}
                    viewportRef={viewportRef}
                    arrangementLength={arrangement.length_ticks}
                    onCancelReady={onCancelReady}
                    onSelect={(modifiers) => {
                      onSelectItem(selectionItem, modifiers);
                    }}
                    onSnapPreview={onSnapPreview}
                    onCommitMove={(startTick) =>
                      onMoveItems(
                        selected ? selection.items : [selectionItem],
                        startTick - clip.start_tick,
                      )
                    }
                    onCommitResize={(durationTick) =>
                      onResizeItems(
                        selected ? selection.items : [selectionItem],
                        durationTick - clip.duration_tick,
                      )
                    }
                  />
                </CueClipContextMenu>
              );
            })}
          </div>
        </CueRowContextMenu>
        {track.automation_lanes?.map((lane) => {
          const option = resolveAutomationOption(bundle, arrangement, lane.target);
          if (!option) return null;
          return (
            <ArrangementAutomationLane
              key={lane.id}
              arrangement={arrangement}
              clipboardKind={clipboardKind}
              definition={option.definition}
              geometry={geometry}
              lane={lane}
              onCancelReady={onCancelReady}
              selection={selection}
              trackId={track.id}
              viewport={viewport}
              viewportRef={viewportRef}
              onSnapPreview={onSnapPreview}
              onAdd={(tick, value, interpolation) =>
                runCommand(
                  "Add automation keyframe",
                  `arrangement.automation.${lane.id}.keyframe`,
                  (draft) =>
                    addAutomationKeyframe(draft, track.id, lane.id, tick, value, interpolation),
                )
              }
              onCopyItems={onCopyItems}
              onDeleteItems={onDeleteItems}
              onMoveItems={onMoveItems}
              onPreviewItems={previewItems}
              onRegisterProjection={registerProjection}
              onResetProjection={resetProjection}
              onPasteAt={onPasteAt}
              onSelectKeyframe={(item: ArrangementKeyframeSelectionItem, modifiers) =>
                onSelectItem(item, modifiers)
              }
              onDeleteKeyframes={(ids) =>
                runCommand(
                  "Delete automation keyframes",
                  `arrangement.automation.${lane.id}.keyframes`,
                  (draft) => deleteAutomationKeyframes(draft, track.id, lane.id, ids),
                )
              }
              onUpdateKeyframe={(id, changes) =>
                runCommand(
                  "Edit automation keyframe",
                  `arrangement.automation.${lane.id}.keyframe.${id}`,
                  (draft) => updateAutomationKeyframe(draft, track.id, lane.id, id, changes),
                )
              }
              onDeleteLane={() =>
                runCommand("Delete automation lane", `arrangement.automation.${lane.id}`, (draft) =>
                  deleteAutomationLane(draft, track.id, lane.id),
                )
              }
              revealRequest={revealRequest}
            />
          );
        })}
      </div>
    );
  });
}
