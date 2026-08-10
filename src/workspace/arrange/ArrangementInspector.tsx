import { useEffect, useState } from "react";
import { Flag, Gauge, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { assetKey, exactAsset, latestRefsById } from "@/document/projectModel";
import { authoringSessionKey, useAuthoringTransportStore } from "@/authoring/transport";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { workspaceActions } from "@/stores/workspace";
import { ArrangementLoopEditor } from "./ArrangementLoopEditor";
import { WorkspacePanelHeader } from "../WorkspacePanelHeader";

interface TempoDraftPoint {
  time_tick: number;
  bpm: number;
}

export function ArrangementInspector() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const reference = useProjectStore(projectSelectors.selectedArrangementRef);
  const arrangement = exactAsset(bundle.arrangements, reference);
  const [name, setName] = useState(arrangement?.name ?? "");
  const [lengthTicks, setLengthTicks] = useState(arrangement?.length_ticks ?? 30_720);
  const [numerator, setNumerator] = useState(arrangement?.time_signatures[0]?.numerator ?? 4);
  const [denominator, setDenominator] = useState(arrangement?.time_signatures[0]?.denominator ?? 4);
  const [tempoPoints, setTempoPoints] = useState<TempoDraftPoint[]>(
    arrangement?.tempo_map.points ?? [{ time_tick: 0, bpm: 128 }],
  );

  useEffect(() => {
    if (!arrangement) return;
    setName(arrangement.name);
    setLengthTicks(arrangement.length_ticks);
    setNumerator(arrangement.time_signatures[0]?.numerator ?? 4);
    setDenominator(arrangement.time_signatures[0]?.denominator ?? 4);
    setTempoPoints(structuredClone(arrangement.tempo_map.points));
  }, [arrangement]);

  if (!arrangement) return null;
  const sessionKey = authoringSessionKey("arrangement", assetKey(reference));
  const currentPlayheadTick = () =>
    useAuthoringTransportStore.getState().sessions[sessionKey]?.cursorTick ?? 0;
  const masterLane = arrangement.tracks
    .flatMap((track) => track.automation_lanes ?? [])
    .find((lane) => lane.target.scope === "global" && lane.target.parameter_id === "master_dimmer");
  const valid =
    name.trim().length > 0 &&
    Number.isInteger(lengthTicks) &&
    lengthTicks > 0 &&
    Number.isInteger(numerator) &&
    numerator > 0 &&
    [1, 2, 4, 8, 16, 32].includes(denominator) &&
    tempoPoints.length > 0 &&
    tempoPoints[0].time_tick === 0 &&
    tempoPoints.every(
      (point, index) =>
        Number.isInteger(point.time_tick) &&
        point.time_tick >= 0 &&
        point.time_tick < lengthTicks &&
        Number.isFinite(point.bpm) &&
        point.bpm >= 20 &&
        point.bpm <= 400 &&
        (index === 0 || point.time_tick > tempoPoints[index - 1].time_tick),
    );

  const save = () => {
    if (!valid) {
      workspaceActions.setPublishStatus(
        "error",
        "Tempo points must be ordered, unique, inside the Arrangement, and between 20–400 BPM.",
      );
      return;
    }
    projectActions.updateArrangement(reference, "Edit Arrangement settings", (draft) => {
      draft.name = name.trim();
      draft.length_ticks = lengthTicks;
      draft.tempo_map.points = structuredClone(tempoPoints);
      draft.time_signatures = [
        { time_tick: 0, numerator, denominator },
        ...draft.time_signatures.filter((point) => point.time_tick > 0),
      ];
    });
    workspaceActions.setPublishStatus("idle", "Arrangement saved.");
  };

  const addTempoPoint = () => {
    const previous = tempoPoints[tempoPoints.length - 1];
    const timeTick = Math.min(
      lengthTicks - 1,
      Math.max(previous.time_tick + arrangement.ppq * 4, currentPlayheadTick()),
    );
    if (timeTick <= previous.time_tick) return;
    setTempoPoints([...tempoPoints, { time_tick: timeTick, bpm: previous.bpm }]);
  };

  const addMasterAutomation = () => {
    projectActions.updateArrangement(reference, "Add master automation", (draft) => {
      const track = draft.tracks[0];
      track.automation_lanes ??= [];
      track.automation_lanes.push({
        id: "master-dimmer",
        target: { scope: "global", parameter_id: "master_dimmer" },
        keyframes: [
          {
            id: "master-start",
            time_tick: 0,
            value: { type: "scalar", value: 1 },
            interpolation: "linear",
          },
          {
            id: "master-fade",
            time_tick: Math.min(draft.length_ticks - 1, draft.ppq * 8),
            value: { type: "scalar", value: 0.65 },
            interpolation: "linear",
          },
        ],
      });
    });
  };

  const addMarker = () => {
    projectActions.updateArrangement(reference, "Add Arrangement marker", (draft) => {
      const playheadTick = currentPlayheadTick();
      const base = `marker-${playheadTick}`;
      let id = base;
      let suffix = 2;
      while (draft.markers?.some((marker) => marker.id === id)) id = `${base}-${suffix++}`;
      draft.markers ??= [];
      draft.markers.push({
        id,
        name: `Marker ${draft.markers.length + 1}`,
        time_tick: playheadTick,
      });
    });
  };

  return (
    <aside className="bg-card flex h-full min-h-0 flex-col" aria-label="Arrangement inspector">
      <WorkspacePanelHeader icon={Gauge} title="Arrangement clock" iconClassName="text-primary">
        <Badge variant="outline" className="ml-auto">
          Editing
        </Badge>
      </WorkspacePanelHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="arrangement-name">Name</FieldLabel>
              <Input
                id="arrangement-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel htmlFor="arrangement-ppq">PPQ</FieldLabel>
                <Input id="arrangement-ppq" value={arrangement.ppq} disabled />
              </Field>
              <Field>
                <FieldLabel htmlFor="arrangement-length">Length ticks</FieldLabel>
                <Input
                  id="arrangement-length"
                  type="number"
                  min={1}
                  value={lengthTicks}
                  onChange={(event) => setLengthTicks(Number(event.target.value))}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel htmlFor="time-signature-numerator">Beats / bar</FieldLabel>
                <Input
                  id="time-signature-numerator"
                  type="number"
                  min={1}
                  value={numerator}
                  onChange={(event) => setNumerator(Number(event.target.value))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="time-signature-denominator">Beat unit</FieldLabel>
                <Input
                  id="time-signature-denominator"
                  type="number"
                  value={denominator}
                  onChange={(event) => setDenominator(Number(event.target.value))}
                />
              </Field>
            </div>
          </FieldGroup>

          <Separator />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">TempoMap</span>
            <Button size="xs" variant="outline" onClick={addTempoPoint}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              Tempo point
            </Button>
          </div>
          {tempoPoints.map((point, index) => (
            <div
              key={`${index}:${point.time_tick}`}
              className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5"
            >
              <Input
                aria-label={`Tempo point ${index + 1} tick`}
                type="number"
                min={0}
                disabled={index === 0}
                value={point.time_tick}
                onChange={(event) =>
                  setTempoPoints(
                    tempoPoints.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, time_tick: Number(event.target.value) }
                        : candidate,
                    ),
                  )
                }
              />
              <Input
                aria-label={`Tempo point ${index + 1} BPM`}
                type="number"
                min={20}
                max={400}
                step={0.01}
                value={point.bpm}
                onChange={(event) =>
                  setTempoPoints(
                    tempoPoints.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, bpm: Number(event.target.value) }
                        : candidate,
                    ),
                  )
                }
              />
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Delete tempo point ${index + 1}`}
                disabled={index === 0}
                onClick={() =>
                  setTempoPoints(tempoPoints.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ))}
          <FieldDescription>
            TempoMap belongs to this Arrangement. Editing it never moves CueClip or keyframe ticks.
          </FieldDescription>
          <Button size="sm" disabled={!valid} onClick={save}>
            <Save data-icon="inline-start" aria-hidden="true" />
            Save Arrangement
          </Button>

          <Separator />
          <div className="grid grid-cols-1 gap-1.5">
            <Button
              size="xs"
              variant="outline"
              disabled={Boolean(masterLane)}
              onClick={addMasterAutomation}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              Master automation
            </Button>
            <Button size="xs" variant="outline" onClick={addMarker}>
              <Flag data-icon="inline-start" aria-hidden="true" />
              Marker at playhead
            </Button>
          </div>
          <ArrangementLoopEditor reference={reference} durationTicks={arrangement.length_ticks} />
          <Separator />
          <DeleteArrangementButton
            arrangementName={arrangement.name}
            reference={reference}
            disabled={latestRefsById(bundle.manifest.arrangement_refs).length <= 1}
          />
        </div>
      </ScrollArea>
    </aside>
  );
}

function DeleteArrangementButton({
  arrangementName,
  reference,
  disabled,
}: {
  arrangementName: string;
  reference: { id: string; revision: number };
  disabled: boolean;
}) {
  const bundle = useProjectStore(projectSelectors.bundle);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const arrangement = exactAsset(bundle.arrangements, reference);
  const clipCount =
    arrangement?.tracks.reduce((count, track) => count + (track.clips?.length ?? 0), 0) ?? 0;
  const automationCount =
    arrangement?.tracks.reduce(
      (count, track) => count + (track.automation_lanes?.length ?? 0),
      0,
    ) ?? 0;
  const markerCount = arrangement?.markers?.length ?? 0;

  const remove = () => {
    try {
      projectActions.deleteArrangement(reference);
      workspaceActions.setPublishStatus("idle", `${arrangementName} deleted.`);
      setConfirmOpen(false);
    } catch (error) {
      workspaceActions.setPublishStatus(
        "error",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="destructive"
        disabled={disabled}
        title={disabled ? "A Project requires at least one Arrangement." : undefined}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 data-icon="inline-start" aria-hidden="true" />
        Delete Arrangement
      </Button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Arrangement?</DialogTitle>
            <DialogDescription>
              {arrangementName} contains {clipCount} CueClip{clipCount === 1 ? "" : "s"},{" "}
              {automationCount} automation lane{automationCount === 1 ? "" : "s"}, and {markerCount}{" "}
              marker{markerCount === 1 ? "" : "s"}. The Arrangement and all of this timeline data
              will be removed. This cannot be undone from editor history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={remove}>
              Delete Arrangement now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
