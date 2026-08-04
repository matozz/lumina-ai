import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clampBeatWidth, createTimelineGeometry } from "@/panel/timelineGeometry";
import { viewportFromScroll, type TimelineViewport } from "@/panel/virtualization";

const DEFAULT_BEAT_WIDTH = 48;

export function useArrangementTimelineViewport(ppq: number) {
  const [beatWidth, setBeatWidth] = useState(DEFAULT_BEAT_WIDTH);
  const [viewport, setViewport] = useState<TimelineViewport>({
    startBeat: 0,
    endBeat: 40,
    visibleStartBeat: 0,
    visibleEndBeat: 32,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);
  const geometry = useMemo(() => createTimelineGeometry(ppq, beatWidth), [beatWidth, ppq]);

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

  const zoom = (requestedBeatWidth: number) => {
    const next = clampBeatWidth(requestedBeatWidth);
    const scroll = scrollRef.current;
    const centerBeat = scroll ? (scroll.scrollLeft + scroll.clientWidth / 2) / beatWidth : 0;
    setBeatWidth(next);
    requestAnimationFrame(() => {
      if (!scroll) return;
      scroll.scrollLeft = Math.max(0, centerBeat * next - scroll.clientWidth / 2);
      updateViewport(scroll);
    });
  };

  return { beatWidth, geometry, headersRef, scrollRef, updateViewport, viewport, zoom };
}
