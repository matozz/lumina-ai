import { CircleHelp, Copy, Plus, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { ArrangementDocument, AssetRef, ProjectBundle } from "@/bridge/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assetKey, exactAsset, latestRefsById } from "@/document/projectModel";
import { MAX_BEAT_WIDTH, MIN_BEAT_WIDTH, type TimelineGeometry } from "@/panel/timelineGeometry";

interface ArrangementTimelineToolbarProps {
  arrangement: ArrangementDocument;
  beatWidth: number;
  bundle: ProjectBundle;
  canRedo: boolean;
  canUndo: boolean;
  geometry: TimelineGeometry;
  onCreate: () => void;
  onDuplicate: () => void;
  onPlaceCue: () => void;
  onRedo: () => void;
  onSelectArrangement: (reference: AssetRef) => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  reference: AssetRef;
  selectedCueRef: AssetRef | null;
}

export function ArrangementTimelineToolbar({
  arrangement,
  beatWidth,
  bundle,
  canRedo,
  canUndo,
  geometry,
  onCreate,
  onDuplicate,
  onPlaceCue,
  onRedo,
  onSelectArrangement,
  onUndo,
  onZoomIn,
  onZoomOut,
  reference,
  selectedCueRef,
}: ArrangementTimelineToolbarProps) {
  const refs = latestRefsById(bundle.manifest.arrangement_refs);
  const items = refs.map((candidate) => ({
    value: assetKey(candidate),
    label:
      exactAsset(bundle.arrangements, candidate)?.name ?? `${candidate.id} r${candidate.revision}`,
  }));

  return (
    <div className="border-border bg-card flex min-h-10 shrink-0 items-center gap-1.5 border-b px-2">
      <Select
        items={items}
        value={assetKey(reference)}
        onValueChange={(value) => {
          const selected = refs.find((candidate) => assetKey(candidate) === value);
          if (selected) onSelectArrangement(selected);
        }}
      >
        <SelectTrigger size="sm" className="min-w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Badge variant="outline">r{arrangement.revision}</Badge>
      <Button size="xs" variant="ghost" onClick={onCreate}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        New
      </Button>
      <Button size="xs" variant="ghost" onClick={onDuplicate}>
        <Copy data-icon="inline-start" aria-hidden="true" />
        Duplicate
      </Button>
      <Button size="xs" disabled={!selectedCueRef} onClick={onPlaceCue}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        Place selected Cue
      </Button>
      <div className="ml-auto flex items-center gap-0.5" aria-label="Timeline zoom and snap">
        <Button
          size="icon-xs"
          variant="ghost"
          disabled={beatWidth <= MIN_BEAT_WIDTH}
          aria-label="Zoom Arrangement timeline out"
          onClick={onZoomOut}
        >
          <ZoomOut aria-hidden="true" />
        </Button>
        <span className="text-muted-foreground min-w-16 text-center font-mono text-[9px]">
          SNAP {formatSnap(geometry.snapTicks, geometry.ppq)}
        </span>
        <Button
          size="icon-xs"
          variant="ghost"
          disabled={beatWidth >= MAX_BEAT_WIDTH}
          aria-label="Zoom Arrangement timeline in"
          onClick={onZoomIn}
        >
          <ZoomIn aria-hidden="true" />
        </Button>
      </div>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Undo Arrangement edit"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2 aria-hidden="true" />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Redo Arrangement edit"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Redo2 aria-hidden="true" />
      </Button>
      <Popover>
        <PopoverTrigger
          render={
            <Button size="icon-xs" variant="ghost" aria-label="Arrangement timeline shortcuts">
              <CircleHelp aria-hidden="true" />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-72">
          <PopoverTitle>Arrange controls</PopoverTitle>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
            <Shortcut keys="Ruler click" action="Seek to adaptive snap" />
            <Shortcut keys="← / →" action="Nudge clip or keyframes" />
            <Shortcut keys="Shift + ← / →" action="Nudge by one beat" />
            <Shortcut keys="Alt + ← / →" action="Resize selected clip" />
            <Shortcut keys="Double-click lane" action="Add typed keyframe" />
            <Shortcut keys="Delete" action="Delete selection" />
            <Shortcut keys="⌘/Ctrl + Z" action="Undo one transaction" />
          </dl>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Shortcut({ keys, action }: { keys: string; action: string }) {
  return (
    <>
      <dt className="font-mono">{keys}</dt>
      <dd className="text-muted-foreground">{action}</dd>
    </>
  );
}

function formatSnap(snapTicks: number, ppq: number) {
  const beats = snapTicks / ppq;
  if (beats === 0.25) return "¼ beat";
  if (beats === 0.5) return "½ beat";
  return `${beats} beat`;
}
