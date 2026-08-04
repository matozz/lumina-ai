import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import type { CueClip } from "@/bridge/types";
import { AuthoringDiagnosticAlert } from "@/authoring/AuthoringDiagnosticAlert";
import type { AuthoringDiagnostic } from "@/authoring/diagnostics";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ArrangementClipInspectorProps {
  arrangementLength: number;
  clip: CueClip | null;
  cueName: string | null;
  diagnostic: AuthoringDiagnostic | null;
  onDelete: () => void;
  onDuplicate: () => void;
  onRecover: () => void;
  onUpdate: (
    changes: Partial<
      Pick<CueClip, "start_tick" | "duration_tick" | "source_offset_tick" | "playback" | "layer">
    >,
  ) => void;
}

export function ArrangementClipInspector({
  arrangementLength,
  clip,
  cueName,
  diagnostic,
  onDelete,
  onDuplicate,
  onRecover,
  onUpdate,
}: ArrangementClipInspectorProps) {
  const [startTick, setStartTick] = useState(0);
  const [durationTick, setDurationTick] = useState(1);
  const [sourceOffsetTick, setSourceOffsetTick] = useState(0);
  const [layer, setLayer] = useState(0);
  const [playback, setPlayback] = useState<"once" | "loop">("once");

  useEffect(() => {
    if (!clip) return;
    setStartTick(clip.start_tick);
    setDurationTick(clip.duration_tick);
    setSourceOffsetTick(clip.source_offset_tick ?? 0);
    setLayer(clip.layer ?? 0);
    setPlayback(clip.playback ?? "once");
  }, [clip]);

  if (!clip) {
    return (
      <aside className="border-border bg-card text-muted-foreground flex w-64 shrink-0 items-center border-l p-4 text-xs">
        Select a CueClip to inspect its pinned Cue revision, range, source offset, playback, and
        layer.
      </aside>
    );
  }

  const valid =
    Number.isInteger(startTick) &&
    startTick >= 0 &&
    Number.isInteger(durationTick) &&
    durationTick > 0 &&
    startTick + durationTick <= arrangementLength &&
    Number.isInteger(sourceOffsetTick) &&
    sourceOffsetTick >= 0 &&
    Number.isInteger(layer) &&
    layer >= 0;

  return (
    <aside
      className="border-border bg-card flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l p-3"
      aria-label="CueClip selection inspector"
    >
      <div>
        <p className="truncate text-xs font-medium">{cueName ?? clip.cue_ref.id}</p>
        <p className="text-muted-foreground font-mono text-[10px]">
          {clip.cue_ref.id}@{clip.cue_ref.revision} · {clip.id}
        </p>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="clip-start-tick">Start tick</FieldLabel>
          <Input
            id="clip-start-tick"
            type="number"
            min={0}
            value={startTick}
            onChange={(event) => setStartTick(Number(event.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="clip-duration-tick">Duration ticks</FieldLabel>
          <Input
            id="clip-duration-tick"
            type="number"
            min={1}
            value={durationTick}
            onChange={(event) => setDurationTick(Number(event.target.value))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel htmlFor="clip-source-offset">Source offset</FieldLabel>
            <Input
              id="clip-source-offset"
              type="number"
              min={0}
              value={sourceOffsetTick}
              onChange={(event) => setSourceOffsetTick(Number(event.target.value))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="clip-layer">Layer</FieldLabel>
            <Input
              id="clip-layer"
              type="number"
              min={0}
              value={layer}
              onChange={(event) => setLayer(Number(event.target.value))}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="clip-playback">Playback</FieldLabel>
          <Select
            value={playback}
            onValueChange={(value) => value && setPlayback(value as "once" | "loop")}
          >
            <SelectTrigger id="clip-playback" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="once">Once</SelectItem>
                <SelectItem value="loop">Loop Cue source</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Authoring transport loop remains session-only and separate.
          </FieldDescription>
        </Field>
      </FieldGroup>
      <Button
        size="sm"
        disabled={!valid}
        onClick={() =>
          onUpdate({
            start_tick: startTick,
            duration_tick: durationTick,
            source_offset_tick: sourceOffsetTick,
            layer,
            playback,
          })
        }
      >
        Apply CueClip
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button size="xs" variant="outline" onClick={onDuplicate}>
          <Copy data-icon="inline-start" aria-hidden="true" />
          Duplicate
        </Button>
        <Button size="xs" variant="destructive" onClick={onDelete}>
          <Trash2 data-icon="inline-start" aria-hidden="true" />
          Delete
        </Button>
      </div>
      {diagnostic && (
        <AuthoringDiagnosticAlert
          diagnostic={diagnostic}
          recoveryLabel="Reset selection"
          onRecover={onRecover}
        />
      )}
    </aside>
  );
}
