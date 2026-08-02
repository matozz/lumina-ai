import { createContext, useContext } from "react";
import type { KeyframeDSL, KeyframeInterpolationDSL, ParameterValueDSL } from "@/bridge/types";

export const BEAT_WIDTH = 40;

export interface TimelineActions {
  onDragStart: (
    e: React.PointerEvent,
    originalIndex: number,
    startBeat: number,
    element: HTMLElement,
  ) => void;
  onResizeStart: (
    e: React.PointerEvent,
    originalIndex: number,
    startDuration: number,
    element: HTMLElement,
  ) => void;
  onDelete: (originalIndex: number) => void;
  onNudge: (originalIndex: number, deltaBeats: number) => void;
  onTrimClipOverlaps: (originalIndex: number) => void;
  onReplaceClipOverlaps: (originalIndex: number) => void;
  onAddKeyframe: (
    trackId: string,
    laneId: string,
    timeTick: number,
    value: ParameterValueDSL,
    interpolation: KeyframeInterpolationDSL,
  ) => void;
  onMoveKeyframes: (
    trackId: string,
    laneId: string,
    keyframeIds: string[],
    deltaTick: number,
  ) => void;
  onDeleteKeyframes: (trackId: string, laneId: string, keyframeIds: string[]) => void;
  onUpdateKeyframe: (
    trackId: string,
    laneId: string,
    keyframeId: string,
    changes: Partial<Pick<KeyframeDSL, "time_tick" | "value" | "interpolation">>,
  ) => void;
  onGridClick: (e: React.MouseEvent<HTMLDivElement>, trackName: string) => void;
}

export const TimelineActionContext = createContext<TimelineActions | null>(null);

export const useTimelineActions = () => {
  const ctx = useContext(TimelineActionContext);
  if (!ctx)
    throw new Error("useTimelineActions must be used within TimelineActionContext.Provider");
  return ctx;
};
