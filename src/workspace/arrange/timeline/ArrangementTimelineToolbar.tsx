import {
  CircleHelp,
  Copy,
  Focus,
  Maximize2,
  Minimize2,
  Plus,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { AssetRef, ProjectBundle } from "@/bridge/types";
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
import type { ArrangementSnapPreset } from "@/panel/timelineGeometry";

interface ArrangementTimelineToolbarProps {
  beatWidth: number;
  bundle: ProjectBundle;
  canRedo: boolean;
  canUndo: boolean;
  onCreate: () => void;
  onDuplicate: () => void;
  onPlaceCue: () => void;
  onRedo: () => void;
  onSelectArrangement: (reference: AssetRef) => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onSnapChange: (preset: ArrangementSnapPreset) => void;
  onToggleFocus: () => void;
  reference: AssetRef;
  selectedCueName: string | null;
  snapPreset: ArrangementSnapPreset;
  focusMode: boolean;
}

export function ArrangementTimelineToolbar({
  beatWidth,
  bundle,
  canRedo,
  canUndo,
  onCreate,
  onDuplicate,
  onPlaceCue,
  onRedo,
  onSelectArrangement,
  onUndo,
  onZoomIn,
  onZoomOut,
  onFit,
  onSnapChange,
  onToggleFocus,
  reference,
  selectedCueName,
  snapPreset,
  focusMode,
}: ArrangementTimelineToolbarProps) {
  const refs = latestRefsById(bundle.manifest.arrangement_refs);
  const items = refs.map((candidate) => ({
    value: assetKey(candidate),
    label: exactAsset(bundle.arrangements, candidate)?.name ?? candidate.id,
  }));

  return (
    <div className="border-border bg-card flex min-h-10 shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1">
      <Select
        items={items}
        value={assetKey(reference)}
        onValueChange={(value) => {
          const selected = refs.find((candidate) => assetKey(candidate) === value);
          if (selected) onSelectArrangement(selected);
        }}
      >
        <SelectTrigger size="sm" className="w-40">
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
      <Button size="xs" variant="ghost" onClick={onCreate}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        New
      </Button>
      <Button size="xs" variant="ghost" onClick={onDuplicate}>
        <Copy data-icon="inline-start" aria-hidden="true" />
        Duplicate
      </Button>
      <Button
        size="xs"
        disabled={!selectedCueName}
        title={selectedCueName ? `Place ${selectedCueName} at the playhead` : undefined}
        onClick={onPlaceCue}
      >
        <Plus data-icon="inline-start" aria-hidden="true" />
        Place Cue
      </Button>
      <div className="ml-auto flex items-center gap-0.5" aria-label="Timeline zoom and snap">
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Zoom Arrangement timeline out"
          onClick={onZoomOut}
        >
          <ZoomOut aria-hidden="true" />
        </Button>
        <span className="text-muted-foreground min-w-12 text-center font-mono text-[9px]">
          {beatWidth.toFixed(beatWidth < 10 ? 1 : 0)} px/b
        </span>
        <Select
          items={SNAP_OPTIONS}
          value={snapPreset}
          onValueChange={(value) => onSnapChange(value as ArrangementSnapPreset)}
        >
          <SelectTrigger size="sm" className="w-24" aria-label="Arrangement timeline snap">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {SNAP_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Zoom Arrangement timeline in"
          onClick={onZoomIn}
        >
          <ZoomIn aria-hidden="true" />
        </Button>
        <Button size="icon-xs" variant="ghost" aria-label="Fit entire Arrangement" onClick={onFit}>
          <Focus aria-hidden="true" />
        </Button>
      </div>
      <Button
        size="icon-xs"
        variant={focusMode ? "secondary" : "ghost"}
        aria-label={focusMode ? "Exit Timeline focus mode" : "Enter Timeline focus mode"}
        aria-pressed={focusMode}
        onClick={onToggleFocus}
      >
        {focusMode ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
      </Button>
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
            <Shortcut keys="Ruler click" action="Seek to the current Snap" />
            <Shortcut keys="← / →" action="Nudge clip or keyframes" />
            <Shortcut keys="Shift + ← / →" action="Nudge by one beat" />
            <Shortcut keys="Alt + ← / →" action="Resize selected clip" />
            <Shortcut keys="Double-click lane" action="Add typed keyframe" />
            <Shortcut keys="Delete" action="Delete selection" />
            <Shortcut keys="Space" action="Play or pause this Arrangement" />
            <Shortcut keys="⌘/Ctrl + ↑ / ↓" action="Zoom without changing Snap" />
            <Shortcut keys="⌘/Ctrl + 0" action="Fit the entire Arrangement" />
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

const SNAP_OPTIONS: Array<{ label: string; value: ArrangementSnapPreset }> = [
  { value: "bar", label: "Snap 1 bar" },
  { value: "beat", label: "Snap 1 beat" },
  { value: "half", label: "Snap ½ beat" },
  { value: "quarter", label: "Snap ¼ beat" },
  { value: "eighth", label: "Snap ⅛ beat" },
];
