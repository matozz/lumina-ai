import { createContext, useContext } from "react";
import type { FromTo } from "@/bridge/types";

export const BEAT_WIDTH = 40;

export interface TimelineActions {
  onDragStart: (e: React.PointerEvent, originalIndex: number, startBeat: number) => void;
  onResizeStart: (e: React.PointerEvent, originalIndex: number, startDuration: number) => void;
  onDelete: (originalIndex: number) => void;
  onUpdateAnimation: (
    eventIndex: number,
    fromValue: FromTo,
    toValue: FromTo,
    easing: string,
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
