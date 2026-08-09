import type { ArrangementDocument, ProjectBundle } from "@/bridge/types";
import { exactAsset } from "@/document/projectModel";
import type { TimelineGeometry } from "@/panel/timelineGeometry";
import type { TimelineViewport } from "@/panel/virtualization";
import { ArrangementAutomationLane } from "./ArrangementAutomationLane";
import { CueClipBlock } from "./CueClipBlock";
import {
  addAutomationKeyframe,
  CUE_TRACK_PADDING,
  CUE_TRACK_ROW_PITCH,
  cueTrackVisualLayout,
  deleteAutomationKeyframes,
  deleteAutomationLane,
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

export type RunArrangementCommand = (
  label: string,
  path: string,
  update: (draft: ArrangementDocument) => void,
) => void;

interface ArrangementTrackRowsProps {
  arrangement: ArrangementDocument;
  bundle: ProjectBundle;
  geometry: TimelineGeometry;
  onCancelReady: (cancel: (() => void) | null) => void;
  onSnapPreview: (tick: number | null) => void;
  runCommand: RunArrangementCommand;
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
  geometry,
  onCancelReady,
  onSnapPreview,
  runCommand,
  selection,
  onMoveItems,
  onResizeItems,
  onSelectItem,
  viewport,
  viewportRef,
}: ArrangementTrackRowsProps) {
  return arrangement.tracks.map((track) => {
    const clips = track.clips ?? [];
    const layout = cueTrackVisualLayout(clips);
    return (
      <div key={track.id}>
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
            return (
              <CueClipBlock
                key={clip.id}
                arrangementLength={arrangement.length_ticks}
                clip={clip}
                cueName={exactAsset(bundle.cues, clip.cue_ref)?.name ?? clip.cue_ref.id}
                geometry={geometry}
                onCancelReady={onCancelReady}
                selected={arrangementSelectionHas(selection, selectionItem)}
                top={CUE_TRACK_PADDING + placement.row * CUE_TRACK_ROW_PITCH}
                visualRow={placement.row}
                viewportRef={viewportRef}
                onSelect={(modifiers) => {
                  onSelectItem(selectionItem, modifiers);
                }}
                onSnapPreview={onSnapPreview}
                onCommitMove={(startTick) =>
                  onMoveItems(
                    arrangementSelectionHas(selection, selectionItem)
                      ? selection.items
                      : [selectionItem],
                    startTick - clip.start_tick,
                  )
                }
                onCommitResize={(durationTick) =>
                  onResizeItems(
                    arrangementSelectionHas(selection, selectionItem)
                      ? selection.items
                      : [selectionItem],
                    durationTick - clip.duration_tick,
                  )
                }
              />
            );
          })}
        </div>
        {track.automation_lanes?.map((lane) => {
          const option = resolveAutomationOption(bundle, arrangement, lane.target);
          if (!option) return null;
          return (
            <ArrangementAutomationLane
              key={lane.id}
              arrangement={arrangement}
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
              onMoveItems={onMoveItems}
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
            />
          );
        })}
      </div>
    );
  });
}
