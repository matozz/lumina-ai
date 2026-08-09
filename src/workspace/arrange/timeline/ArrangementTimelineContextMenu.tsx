import { useState } from "react";
import { Copy, Eye, Files, Plus, Trash2 } from "lucide-react";
import type { ArrangementDocument } from "@/bridge/types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { TimelineGeometry } from "@/panel/timelineGeometry";
import {
  automationTargetKey,
  findAutomationLaneByTarget,
  type ArrangementAutomationOption,
} from "./arrangementTimelineModel";

export type ArrangementClipboardKind = "clips" | "keyframes" | "mixed" | null;

export interface ArrangementContextSurfaceProps {
  arrangementLength: number;
  children: React.ReactNode;
  geometry: TimelineGeometry;
  onCancelReady: (cancel: (() => void) | null) => void;
  onContext?: () => void;
  stopPropagation?: boolean;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}

interface CueClipContextMenuProps extends ArrangementContextSurfaceProps {
  arrangement: ArrangementDocument;
  onAutomation: (option: ArrangementAutomationOption, tick: number) => void;
  onCopy: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  options: ArrangementAutomationOption[];
}

export function CueClipContextMenu({
  arrangement,
  onAutomation,
  onCopy,
  onDelete,
  onDuplicate,
  options,
  ...surface
}: CueClipContextMenuProps) {
  const existing = options.filter((option) =>
    findAutomationLaneByTarget(arrangement, option.target),
  );
  const missing = options.filter(
    (option) => !findAutomationLaneByTarget(arrangement, option.target),
  );
  return (
    <TimelineContextSurface
      {...surface}
      content={(tick) => (
        <ContextMenuContent className="w-64">
          <ContextMenuGroup>
            <ContextMenuLabel>CueClip at tick {tick}</ContextMenuLabel>
          </ContextMenuGroup>
          {missing.length > 0 && (
            <AutomationOptionsSubmenu
              label="Add automation"
              options={missing}
              onSelect={(option) => onAutomation(option, tick)}
            />
          )}
          {existing.length === 1 ? (
            <ContextMenuItem onClick={() => onAutomation(existing[0], tick)}>
              <Eye aria-hidden="true" />
              Reveal existing automation
            </ContextMenuItem>
          ) : existing.length > 1 ? (
            <AutomationOptionsSubmenu
              icon={<Eye aria-hidden="true" />}
              label="Reveal existing automation"
              options={existing}
              onSelect={(option) => onAutomation(option, tick)}
            />
          ) : null}
          {(missing.length > 0 || existing.length > 0) && <ContextMenuSeparator />}
          <ContextMenuItem onClick={onDuplicate}>
            <Files aria-hidden="true" />
            Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={onCopy}>
            <Copy aria-hidden="true" />
            Copy
            <ContextMenuShortcut>⌘C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 aria-hidden="true" />
            Delete
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      )}
    />
  );
}

interface CueRowContextMenuProps extends ArrangementContextSurfaceProps {
  clipboardKind: ArrangementClipboardKind;
  canPlaceCue: boolean;
  onPaste: (tick: number) => void;
  onPlaceCue: (tick: number) => void;
}

export function CueRowContextMenu({
  canPlaceCue,
  clipboardKind,
  onPaste,
  onPlaceCue,
  ...surface
}: CueRowContextMenuProps) {
  return (
    <TimelineContextSurface
      {...surface}
      content={(tick) => (
        <ContextMenuContent className="w-56">
          <ContextMenuGroup>
            <ContextMenuLabel>Cue row at tick {tick}</ContextMenuLabel>
          </ContextMenuGroup>
          <ContextMenuItem disabled={!canPlaceCue} onClick={() => onPlaceCue(tick)}>
            <Plus aria-hidden="true" />
            Place selected Cue here
          </ContextMenuItem>
          <ContextMenuItem disabled={!clipboardKind} onClick={() => onPaste(tick)}>
            <Copy aria-hidden="true" />
            Paste here
            <ContextMenuShortcut>⌘V</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      )}
    />
  );
}

export function TimelineContextSurface({
  arrangementLength,
  children,
  content,
  geometry,
  onCancelReady,
  onContext,
  stopPropagation,
  viewportRef,
}: ArrangementContextSurfaceProps & { content: (tick: number) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  return (
    <ContextMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        onCancelReady(nextOpen ? () => setOpen(false) : null);
      }}
    >
      <ContextMenuTrigger
        className="contents"
        onContextMenu={(event) => {
          if (stopPropagation) event.stopPropagation();
          setTick(
            timelineContextTick(event.clientX, viewportRef.current, geometry, arrangementLength),
          );
          onContext?.();
        }}
      >
        {children}
      </ContextMenuTrigger>
      {content(tick)}
    </ContextMenu>
  );
}

function AutomationOptionsSubmenu({
  icon,
  label,
  onSelect,
  options,
}: {
  icon?: React.ReactNode;
  label: string;
  onSelect: (option: ArrangementAutomationOption) => void;
  options: ArrangementAutomationOption[];
}) {
  const [open, setOpen] = useState(false);
  const layerGroups = new Map<string, ArrangementAutomationOption[]>();
  for (const option of options) {
    const label = option.layerLabel ?? "Layer";
    layerGroups.set(label, [...(layerGroups.get(label) ?? []), option]);
  }
  const grouped = options.some((option) => (option.layerCount ?? 1) > 1);
  return (
    <ContextMenuSub open={open} onOpenChange={setOpen}>
      <ContextMenuSubTrigger onClick={() => setOpen(true)}>
        {icon}
        {label}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-64">
        {grouped
          ? [...layerGroups.entries()].map(([layerLabel, layerOptions]) => (
              <AutomationLayerSubmenu
                key={layerLabel}
                label={layerLabel}
                onSelect={onSelect}
                options={layerOptions}
              />
            ))
          : options.map((option) => (
              <AutomationOptionItem
                key={automationTargetKey(option.target)}
                option={option}
                onSelect={onSelect}
              />
            ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

function AutomationLayerSubmenu({
  label,
  onSelect,
  options,
}: {
  label: string;
  onSelect: (option: ArrangementAutomationOption) => void;
  options: ArrangementAutomationOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <ContextMenuSub open={open} onOpenChange={setOpen}>
      <ContextMenuSubTrigger onClick={() => setOpen(true)}>{label}</ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-56">
        {options.map((option) => (
          <AutomationOptionItem
            key={automationTargetKey(option.target)}
            option={option}
            onSelect={onSelect}
          />
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

function AutomationOptionItem({
  onSelect,
  option,
}: {
  onSelect: (option: ArrangementAutomationOption) => void;
  option: ArrangementAutomationOption;
}) {
  return (
    <ContextMenuItem onClick={() => onSelect(option)}>
      <span className="min-w-0 truncate">{option.definition.name}</span>
      <span className="text-muted-foreground ml-auto text-[10px]">
        {option.definition.value_type}
      </span>
    </ContextMenuItem>
  );
}

export function timelineContextTick(
  clientX: number,
  viewport: HTMLDivElement | null,
  geometry: TimelineGeometry,
  arrangementLength: number,
) {
  if (!viewport || arrangementLength <= 0) return 0;
  const rect = viewport.getBoundingClientRect();
  const pixels = clientX - rect.left + viewport.scrollLeft;
  const rawTick = (pixels / geometry.beatWidth) * geometry.ppq;
  const snapped = Math.round(rawTick / geometry.snapTicks) * geometry.snapTicks;
  return Math.max(0, Math.min(arrangementLength - 1, snapped));
}
