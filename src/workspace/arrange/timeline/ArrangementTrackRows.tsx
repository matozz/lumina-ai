import type { ArrangementDocument, ProjectBundle } from "@/bridge/types";
import { exactAsset } from "@/document/projectModel";
import type { TimelineGeometry } from "@/panel/timelineGeometry";
import type { TimelineViewport } from "@/panel/virtualization";
import { ArrangementAutomationLane } from "./ArrangementAutomationLane";
import { CueClipBlock } from "./CueClipBlock";
import {
  addAutomationKeyframe,
  deleteAutomationKeyframes,
  deleteAutomationLane,
  deleteCueClip,
  duplicateCueClip,
  moveAutomationKeyframes,
  moveCueClip,
  resizeCueClip,
  resolveAutomationOption,
  updateAutomationKeyframe,
} from "./arrangementTimelineModel";

export type RunArrangementCommand = (
  label: string,
  path: string,
  update: (draft: ArrangementDocument) => void,
) => void;

interface ArrangementTrackRowsProps {
  arrangement: ArrangementDocument;
  bundle: ProjectBundle;
  geometry: TimelineGeometry;
  onSelectClip: (id: string | null) => void;
  onSnapPreview: (tick: number | null) => void;
  runCommand: RunArrangementCommand;
  selectedClipId: string | null;
  viewport: TimelineViewport;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}

export function ArrangementTrackRows({
  arrangement,
  bundle,
  geometry,
  onSelectClip,
  onSnapPreview,
  runCommand,
  selectedClipId,
  viewport,
  viewportRef,
}: ArrangementTrackRowsProps) {
  return arrangement.tracks.map((track) => (
    <div key={track.id}>
      <div className="border-border relative h-16 border-b">
        {(track.clips ?? [])
          .filter(
            (clip) =>
              clip.start_tick + clip.duration_tick >= viewport.startBeat * arrangement.ppq &&
              clip.start_tick <= viewport.endBeat * arrangement.ppq,
          )
          .map((clip) => (
            <CueClipBlock
              key={clip.id}
              arrangementLength={arrangement.length_ticks}
              clip={clip}
              cueName={exactAsset(bundle.cues, clip.cue_ref)?.name ?? clip.cue_ref.id}
              geometry={geometry}
              selected={selectedClipId === clip.id}
              viewportRef={viewportRef}
              onSelect={() => onSelectClip(clip.id)}
              onSnapPreview={onSnapPreview}
              onCommitMove={(startTick) =>
                runCommand("Move CueClip", `arrangement.clip.${clip.id}.move`, (draft) =>
                  moveCueClip(draft, clip.id, startTick),
                )
              }
              onCommitResize={(durationTick) =>
                runCommand("Resize CueClip", `arrangement.clip.${clip.id}.resize`, (draft) =>
                  resizeCueClip(draft, clip.id, durationTick),
                )
              }
              onDelete={() =>
                runCommand("Delete CueClip", `arrangement.clip.${clip.id}.delete`, (draft) => {
                  deleteCueClip(draft, clip.id);
                  onSelectClip(null);
                })
              }
              onDuplicate={() =>
                runCommand("Duplicate CueClip", `arrangement.clip.${clip.id}.duplicate`, (draft) =>
                  onSelectClip(duplicateCueClip(draft, clip.id, geometry.snapTicks)),
                )
              }
            />
          ))}
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
            onMoveKeyframes={(ids, deltaTick) =>
              runCommand(
                "Move automation keyframes",
                `arrangement.automation.${lane.id}.keyframes`,
                (draft) => moveAutomationKeyframes(draft, track.id, lane.id, ids, deltaTick),
              )
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
  ));
}
