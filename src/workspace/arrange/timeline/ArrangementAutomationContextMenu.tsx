import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { KeyframeInterpolationDSL, ParameterDefinitionDSL } from "@/bridge/types";
import { parameterAutomation } from "@/document/effectParameter";
import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  TimelineContextSurface,
  type ArrangementClipboardKind,
  type ArrangementContextSurfaceProps,
} from "./ArrangementTimelineContextMenu";

interface AutomationLaneContextMenuProps extends ArrangementContextSurfaceProps {
  canCopyKeyframes: boolean;
  clipboardKind: ArrangementClipboardKind;
  onAdd: (tick: number) => void;
  onCopy: () => void;
  onDeleteLane: () => void;
  onDeleteSelected: () => void;
  onPaste: (tick: number) => void;
}

export function AutomationLaneContextMenu({
  canCopyKeyframes,
  clipboardKind,
  onAdd,
  onCopy,
  onDeleteLane,
  onDeleteSelected,
  onPaste,
  ...surface
}: AutomationLaneContextMenuProps) {
  return (
    <TimelineContextSurface
      {...surface}
      content={(tick) => (
        <ContextMenuContent className="w-56">
          <ContextMenuGroup>
            <ContextMenuLabel>Automation at tick {tick}</ContextMenuLabel>
          </ContextMenuGroup>
          <ContextMenuItem onClick={() => onAdd(tick)}>
            <Plus aria-hidden="true" />
            Add keyframe here
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={!canCopyKeyframes} onClick={onCopy}>
            <Copy aria-hidden="true" />
            Copy keyframes
            <ContextMenuShortcut>⌘C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem disabled={clipboardKind !== "keyframes"} onClick={() => onPaste(tick)}>
            <Copy aria-hidden="true" />
            Paste keyframes
            <ContextMenuShortcut>⌘V</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem disabled={!canCopyKeyframes} onClick={onDeleteSelected}>
            <Trash2 aria-hidden="true" />
            Delete selected
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={onDeleteLane}>
            <Trash2 aria-hidden="true" />
            Delete lane
          </ContextMenuItem>
        </ContextMenuContent>
      )}
    />
  );
}

interface AutomationKeyframeContextMenuProps extends AutomationLaneContextMenuProps {
  definition: ParameterDefinitionDSL;
  interpolation: KeyframeInterpolationDSL;
  onEdit: () => void;
  onInterpolation: (interpolation: KeyframeInterpolationDSL) => void;
}

export function AutomationKeyframeContextMenu({
  definition,
  interpolation,
  onEdit,
  onInterpolation,
  ...props
}: AutomationKeyframeContextMenuProps) {
  const interpolations: KeyframeInterpolationDSL[] =
    parameterAutomation(definition) === "discrete"
      ? ["hold"]
      : ["linear", "ease_in", "ease_out", "ease_in_out", "bezier", "hold"];
  return (
    <TimelineContextSurface
      {...props}
      stopPropagation
      content={(tick) => (
        <ContextMenuContent className="w-56">
          <ContextMenuGroup>
            <ContextMenuLabel>Keyframe at tick {tick}</ContextMenuLabel>
          </ContextMenuGroup>
          <ContextMenuItem onClick={onEdit}>
            <Pencil aria-hidden="true" />
            Edit value
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Interpolation</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {interpolations.map((value) => (
                <ContextMenuItem key={value} onClick={() => onInterpolation(value)}>
                  {interpolation === value ? "✓ " : ""}
                  {interpolationLabel(value)}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => props.onAdd(tick)}>
            <Plus aria-hidden="true" />
            Add keyframe here
          </ContextMenuItem>
          <ContextMenuItem disabled={!props.canCopyKeyframes} onClick={props.onCopy}>
            <Copy aria-hidden="true" />
            Copy keyframes
          </ContextMenuItem>
          <ContextMenuItem
            disabled={props.clipboardKind !== "keyframes"}
            onClick={() => props.onPaste(tick)}
          >
            <Copy aria-hidden="true" />
            Paste keyframes
          </ContextMenuItem>
          <ContextMenuItem onClick={props.onDeleteSelected}>
            <Trash2 aria-hidden="true" />
            Delete selected
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={props.onDeleteLane}>
            <Trash2 aria-hidden="true" />
            Delete lane
          </ContextMenuItem>
        </ContextMenuContent>
      )}
    />
  );
}

function interpolationLabel(value: KeyframeInterpolationDSL) {
  return value === "ease_in_out"
    ? "Ease in/out"
    : value === "ease_in"
      ? "Ease in"
      : value === "ease_out"
        ? "Ease out"
        : value[0].toUpperCase() + value.slice(1);
}
