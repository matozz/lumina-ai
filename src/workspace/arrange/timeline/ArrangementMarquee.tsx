import { useEffect, useMemo, useRef } from "react";
import type { ArrangementDocument, ProjectBundle } from "@/bridge/types";
import type { TimelineGeometry } from "@/panel/timelineGeometry";
import { cn } from "@/lib/utils";
import {
  arrangementSelectionHitLayout,
  selectionAfterMarquee,
  type ArrangementTimelineSelection,
} from "./arrangementSelection";

interface ArrangementMarqueeProps {
  arrangement: ArrangementDocument;
  bundle: ProjectBundle;
  children: React.ReactNode;
  geometry: TimelineGeometry;
  onCancelReady: (cancel: (() => void) | null) => void;
  onSelectionChange: (selection: ArrangementTimelineSelection) => void;
  selection: ArrangementTimelineSelection;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}

interface MarqueeInteraction {
  additive: boolean;
  currentClientX: number;
  currentClientY: number;
  pointerId: number;
  snapshot: ArrangementTimelineSelection;
  startX: number;
  startY: number;
}

const EDGE_ZONE = 28;
const MAX_AUTO_SCROLL = 18;

export function ArrangementMarquee({
  arrangement,
  bundle,
  children,
  geometry,
  onCancelReady,
  onSelectionChange,
  selection,
  viewportRef,
}: ArrangementMarqueeProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<MarqueeInteraction | null>(null);
  const frameRef = useRef<number | null>(null);
  const layout = useMemo(
    () => arrangementSelectionHitLayout(arrangement, geometry, bundle),
    [arrangement, bundle, geometry],
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const flush = () => {
    frameRef.current = null;
    const interaction = interactionRef.current;
    const surface = surfaceRef.current;
    const viewport = viewportRef.current;
    if (!interaction || !surface) return;

    let autoScrolling = false;
    if (viewport) {
      const viewportRect = viewport.getBoundingClientRect();
      const deltaX = marqueeAutoScrollDelta(
        interaction.currentClientX,
        viewportRect.left,
        viewportRect.right,
      );
      const deltaY = marqueeAutoScrollDelta(
        interaction.currentClientY,
        viewportRect.top,
        viewportRect.bottom,
      );
      if (deltaX !== 0 || deltaY !== 0) {
        viewport.scrollLeft += deltaX;
        viewport.scrollTop += deltaY;
        autoScrolling = true;
      }
    }

    const surfaceRect = surface.getBoundingClientRect();
    const currentX = interaction.currentClientX - surfaceRect.left;
    const currentY = interaction.currentClientY - surfaceRect.top;
    const rect = {
      left: Math.min(interaction.startX, currentX),
      right: Math.max(interaction.startX, currentX),
      top: Math.min(interaction.startY, currentY),
      bottom: Math.max(interaction.startY, currentY),
    };
    if (boxRef.current) {
      boxRef.current.style.display = "block";
      boxRef.current.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      boxRef.current.style.width = `${Math.max(1, rect.right - rect.left)}px`;
      boxRef.current.style.height = `${Math.max(1, rect.bottom - rect.top)}px`;
    }
    onSelectionChange(
      selectionAfterMarquee(layoutRef.current, rect, interaction.snapshot, interaction.additive),
    );
    if (autoScrolling && frameRef.current === null) {
      frameRef.current = requestAnimationFrame(flush);
    }
  };

  const schedule = () => {
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
  };

  const finish = (commit: boolean) => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      flush();
    }
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (!commit && interaction) onSelectionChange(interaction.snapshot);
    if (boxRef.current) boxRef.current.style.display = "none";
    onCancelReady(null);
  };

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return (
    <div
      ref={surfaceRef}
      className={cn("relative", layout.height === 0 && "min-h-16")}
      style={{ minHeight: layout.height }}
      data-arrangement-selection-surface
      onPointerDown={(event) => {
        if (event.button !== 0 || marqueeStartIsBlocked(event.target)) return;
        const surface = surfaceRef.current;
        if (!surface) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = surface.getBoundingClientRect();
        interactionRef.current = {
          additive: event.shiftKey,
          currentClientX: event.clientX,
          currentClientY: event.clientY,
          pointerId: event.pointerId,
          snapshot: selection,
          startX: event.clientX - rect.left,
          startY: event.clientY - rect.top,
        };
        onCancelReady(() => finish(false));
        schedule();
      }}
      onPointerMove={(event) => {
        const interaction = interactionRef.current;
        if (!interaction || interaction.pointerId !== event.pointerId) return;
        interaction.currentClientX = event.clientX;
        interaction.currentClientY = event.clientY;
        schedule();
      }}
      onPointerUp={(event) => {
        if (interactionRef.current?.pointerId === event.pointerId) finish(true);
      }}
      onPointerCancel={(event) => {
        if (interactionRef.current?.pointerId === event.pointerId) finish(false);
      }}
      onLostPointerCapture={() => {
        if (interactionRef.current) finish(false);
      }}
    >
      {children}
      <div
        ref={boxRef}
        className="border-primary bg-primary/10 pointer-events-none absolute top-0 left-0 z-30 hidden border"
        aria-hidden="true"
        data-arrangement-marquee
      />
    </div>
  );
}

export function marqueeAutoScrollDelta(position: number, start: number, end: number) {
  if (position < start + EDGE_ZONE) {
    return -Math.ceil(
      MAX_AUTO_SCROLL * Math.min(1, Math.max(0, (start + EDGE_ZONE - position) / EDGE_ZONE)),
    );
  }
  if (position > end - EDGE_ZONE) {
    return Math.ceil(
      MAX_AUTO_SCROLL * Math.min(1, Math.max(0, (position - (end - EDGE_ZONE)) / EDGE_ZONE)),
    );
  }
  return 0;
}

function marqueeStartIsBlocked(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      'button, input, select, textarea, [contenteditable="true"], [data-marquee-ignore]',
    ) !== null
  );
}
