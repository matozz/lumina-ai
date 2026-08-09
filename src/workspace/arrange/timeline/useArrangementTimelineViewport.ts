import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clampBeatWidth,
  createTimelineGeometry,
  snapTicksForPreset,
  ticksToPixels,
  type ArrangementSnapPreset,
} from "@/panel/timelineGeometry";
import { viewportFromScroll, type TimelineViewport } from "@/panel/virtualization";

const DEFAULT_BEAT_WIDTH = 48;
const MAX_ARRANGEMENT_BEAT_WIDTH = 384;
const MIN_ARRANGEMENT_BEAT_WIDTH = 0.5;
const ZOOM_FACTOR = 1.25;

export function useArrangementTimelineViewport(
  ppq: number,
  lengthTicks: number,
  timeSignature = { numerator: 4, denominator: 4 },
) {
  const [beatWidth, setBeatWidth] = useState(DEFAULT_BEAT_WIDTH);
  const [snapPreset, setSnapPreset] = useState<ArrangementSnapPreset>("half");
  const [viewport, setViewport] = useState<TimelineViewport>({
    startBeat: 0,
    endBeat: 40,
    visibleStartBeat: 0,
    visibleEndBeat: 32,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);
  const pointerClientXRef = useRef<number | null>(null);
  const snapTicks = snapTicksForPreset(ppq, snapPreset, timeSignature);
  const geometry = useMemo(
    () => createTimelineGeometry(ppq, beatWidth, snapTicks),
    [beatWidth, ppq, snapTicks],
  );

  const updateViewport = useCallback(
    (element: HTMLDivElement) => {
      const next = viewportFromScroll(element.scrollLeft, element.clientWidth, beatWidth);
      setViewport((current) =>
        current.startBeat === next.startBeat &&
        current.endBeat === next.endBeat &&
        current.visibleStartBeat === next.visibleStartBeat &&
        current.visibleEndBeat === next.visibleEndBeat
          ? current
          : next,
      );
    },
    [beatWidth],
  );

  useEffect(() => {
    const update = () => {
      if (scrollRef.current) updateViewport(scrollRef.current);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [updateViewport]);

  const zoomTo = useCallback(
    (requestedBeatWidth: number, preferredAnchorTick?: number) => {
      const scroll = scrollRef.current;
      const minimum = scroll
        ? Math.min(DEFAULT_BEAT_WIDTH, fitBeatWidth(lengthTicks, ppq, scroll.clientWidth))
        : MIN_ARRANGEMENT_BEAT_WIDTH;
      const next = clampBeatWidth(
        requestedBeatWidth,
        Math.max(MIN_ARRANGEMENT_BEAT_WIDTH, minimum),
        MAX_ARRANGEMENT_BEAT_WIDTH,
      );
      if (!scroll || next === beatWidth) return;

      const rect = scroll.getBoundingClientRect();
      const pointerClientX = pointerClientXRef.current;
      const pointerOffset =
        pointerClientX !== null && pointerClientX >= rect.left && pointerClientX <= rect.right
          ? pointerClientX - rect.left
          : null;
      const playheadX =
        preferredAnchorTick === undefined
          ? null
          : ticksToPixels(preferredAnchorTick, createTimelineGeometry(ppq, beatWidth, snapTicks));
      const playheadOffset =
        playheadX !== null &&
        playheadX >= scroll.scrollLeft &&
        playheadX <= scroll.scrollLeft + scroll.clientWidth
          ? playheadX - scroll.scrollLeft
          : null;
      const anchorOffset = pointerOffset ?? playheadOffset ?? scroll.clientWidth / 2;
      const anchorTick =
        preferredAnchorTick !== undefined && pointerOffset === null && playheadOffset !== null
          ? preferredAnchorTick
          : ((scroll.scrollLeft + anchorOffset) / beatWidth) * ppq;

      setBeatWidth(next);
      requestAnimationFrame(() => {
        scroll.scrollLeft = anchoredScrollLeft(anchorTick, anchorOffset, ppq, next);
        updateViewport(scroll);
      });
    },
    [beatWidth, lengthTicks, ppq, snapTicks, updateViewport],
  );

  const zoomIn = useCallback(
    (anchorTick?: number) => zoomTo(beatWidth * ZOOM_FACTOR, anchorTick),
    [beatWidth, zoomTo],
  );
  const zoomOut = useCallback(
    (anchorTick?: number) => zoomTo(beatWidth / ZOOM_FACTOR, anchorTick),
    [beatWidth, zoomTo],
  );
  const fit = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const next = fitBeatWidth(lengthTicks, ppq, scroll.clientWidth);
    setBeatWidth(next);
    requestAnimationFrame(() => {
      scroll.scrollLeft = 0;
      updateViewport(scroll);
    });
  }, [lengthTicks, ppq, updateViewport]);

  const trackPointer = useCallback((clientX: number) => {
    pointerClientXRef.current = clientX;
  }, []);

  return {
    beatWidth,
    fit,
    geometry,
    headersRef,
    scrollRef,
    setSnapPreset,
    snapPreset,
    trackPointer,
    updateViewport,
    viewport,
    zoomIn,
    zoomOut,
    zoomTo,
  };
}

export function fitBeatWidth(lengthTicks: number, ppq: number, viewportWidth: number) {
  const beats = Math.max(1, lengthTicks / ppq);
  return clampBeatWidth(
    Math.max(1, viewportWidth - 12) / beats,
    MIN_ARRANGEMENT_BEAT_WIDTH,
    MAX_ARRANGEMENT_BEAT_WIDTH,
  );
}

export function anchoredScrollLeft(
  anchorTick: number,
  anchorOffset: number,
  ppq: number,
  beatWidth: number,
) {
  return Math.max(0, (anchorTick / ppq) * beatWidth - anchorOffset);
}
