import type { ArrangementDocument, ProjectBundle } from "@/bridge/types";
import { keyframeValueY } from "@/panel/keyframeGeometry";
import { ticksToPixels, type TimelineGeometry } from "@/panel/timelineGeometry";
import {
  AUTOMATION_ROW_HEIGHT,
  AUTOMATION_VALUE_INSET,
  CUE_CLIP_HEIGHT,
  CUE_TRACK_PADDING,
  CUE_TRACK_ROW_PITCH,
  cueTrackVisualLayout,
  resolveAutomationOption,
} from "./arrangementTimelineModel";

export interface ArrangementClipSelectionItem {
  clipId: string;
  trackId: string;
  type: "clip";
}

export interface ArrangementKeyframeSelectionItem {
  keyframeId: string;
  laneId: string;
  trackId: string;
  type: "keyframe";
}

export type ArrangementSelectionItem =
  | ArrangementClipSelectionItem
  | ArrangementKeyframeSelectionItem;

export interface ArrangementTimelineSelection {
  anchor: string | null;
  items: ArrangementSelectionItem[];
  primary: string | null;
}

export interface TimelineSelectionRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface ArrangementSelectionHitLayout {
  clips: Array<{ item: ArrangementClipSelectionItem; rect: TimelineSelectionRect }>;
  height: number;
  keyframes: Array<{
    item: ArrangementKeyframeSelectionItem;
    point: { x: number; y: number };
  }>;
}

export const EMPTY_ARRANGEMENT_SELECTION: ArrangementTimelineSelection = {
  anchor: null,
  items: [],
  primary: null,
};

export function arrangementSelectionFromItems(
  items: ArrangementSelectionItem[],
): ArrangementTimelineSelection {
  const first = items[0];
  const last = items[items.length - 1];
  return {
    items,
    anchor: first ? arrangementSelectionItemKey(first) : null,
    primary: last ? arrangementSelectionItemKey(last) : null,
  };
}

export function arrangementSelectionItemKey(item: ArrangementSelectionItem) {
  return item.type === "clip"
    ? `clip:${item.trackId}:${item.clipId}`
    : `keyframe:${item.trackId}:${item.laneId}:${item.keyframeId}`;
}

export function arrangementSelectionHas(
  selection: ArrangementTimelineSelection,
  item: ArrangementSelectionItem,
) {
  const key = arrangementSelectionItemKey(item);
  return selection.items.some((candidate) => arrangementSelectionItemKey(candidate) === key);
}

export function selectionAfterClick(
  current: ArrangementTimelineSelection,
  item: ArrangementSelectionItem,
  modifiers: { additive?: boolean; toggle?: boolean } = {},
): ArrangementTimelineSelection {
  const key = arrangementSelectionItemKey(item);
  if (modifiers.toggle) {
    const exists = arrangementSelectionHas(current, item);
    const items = exists
      ? current.items.filter((candidate) => arrangementSelectionItemKey(candidate) !== key)
      : [...current.items, item];
    const last = items[items.length - 1];
    return {
      items,
      primary: exists ? (last ? arrangementSelectionItemKey(last) : null) : key,
      anchor: current.anchor ?? key,
    };
  }
  if (modifiers.additive) {
    const items = arrangementSelectionHas(current, item) ? current.items : [...current.items, item];
    return { items, primary: key, anchor: current.anchor ?? key };
  }
  return { items: [item], primary: key, anchor: key };
}

export function selectionAfterMarquee(
  layout: ArrangementSelectionHitLayout,
  rect: TimelineSelectionRect,
  snapshot: ArrangementTimelineSelection,
  additive: boolean,
): ArrangementTimelineSelection {
  const hits: ArrangementSelectionItem[] = [
    ...layout.clips
      .filter((entry) => rectanglesIntersect(entry.rect, rect))
      .map((entry) => entry.item),
    ...layout.keyframes
      .filter((entry) => pointInside(entry.point, rect))
      .map((entry) => entry.item),
  ];
  const items = additive ? mergeSelectionItems(snapshot.items, hits) : hits;
  const lastHit = hits[hits.length - 1];
  const primary = lastHit
    ? arrangementSelectionItemKey(lastHit)
    : additive
      ? snapshot.primary
      : null;
  return {
    items,
    primary,
    anchor: additive ? snapshot.anchor : hits[0] ? arrangementSelectionItemKey(hits[0]) : null,
  };
}

export function arrangementSelectionHitLayout(
  arrangement: ArrangementDocument,
  geometry: TimelineGeometry,
  bundle?: ProjectBundle,
): ArrangementSelectionHitLayout {
  const clips: ArrangementSelectionHitLayout["clips"] = [];
  const keyframes: ArrangementSelectionHitLayout["keyframes"] = [];
  let top = 0;

  for (const track of arrangement.tracks) {
    const visual = cueTrackVisualLayout(track.clips ?? []);
    for (const clip of track.clips ?? []) {
      const placement = visual.placements.get(clip.id);
      const clipTop = top + CUE_TRACK_PADDING + (placement?.row ?? 0) * CUE_TRACK_ROW_PITCH;
      const left = ticksToPixels(clip.start_tick, geometry);
      clips.push({
        item: { type: "clip", trackId: track.id, clipId: clip.id },
        rect: {
          left,
          right: left + Math.max(1, ticksToPixels(clip.duration_tick, geometry)),
          top: clipTop,
          bottom: clipTop + CUE_CLIP_HEIGHT,
        },
      });
    }
    top += visual.height;

    for (const lane of track.automation_lanes ?? []) {
      const definition = bundle
        ? resolveAutomationOption(bundle, arrangement, lane.target)?.definition
        : undefined;
      for (const keyframe of lane.keyframes) {
        keyframes.push({
          item: {
            type: "keyframe",
            trackId: track.id,
            laneId: lane.id,
            keyframeId: keyframe.id,
          },
          point: {
            x: ticksToPixels(keyframe.time_tick, geometry),
            y:
              top +
              (definition
                ? keyframeValueY(
                    keyframe.value,
                    definition,
                    AUTOMATION_ROW_HEIGHT,
                    AUTOMATION_VALUE_INSET,
                  )
                : AUTOMATION_ROW_HEIGHT / 2),
          },
        });
      }
      top += AUTOMATION_ROW_HEIGHT;
    }
  }

  return { clips, keyframes, height: top };
}

export function allArrangementItems(arrangement: ArrangementDocument): ArrangementSelectionItem[] {
  return arrangement.tracks.flatMap((track) => [
    ...(track.clips ?? []).map(
      (clip): ArrangementClipSelectionItem => ({
        type: "clip",
        trackId: track.id,
        clipId: clip.id,
      }),
    ),
    ...(track.automation_lanes ?? []).flatMap((lane) =>
      lane.keyframes.map(
        (keyframe): ArrangementKeyframeSelectionItem => ({
          type: "keyframe",
          trackId: track.id,
          laneId: lane.id,
          keyframeId: keyframe.id,
        }),
      ),
    ),
  ]);
}

export function reconcileArrangementSelection(
  selection: ArrangementTimelineSelection,
  arrangement: ArrangementDocument,
): ArrangementTimelineSelection {
  const available = new Set(allArrangementItems(arrangement).map(arrangementSelectionItemKey));
  const items = selection.items.filter((item) => available.has(arrangementSelectionItemKey(item)));
  if (items.length === selection.items.length) return selection;
  return {
    items,
    primary: selection.primary && available.has(selection.primary) ? selection.primary : null,
    anchor: selection.anchor && available.has(selection.anchor) ? selection.anchor : null,
  };
}

function rectanglesIntersect(left: TimelineSelectionRect, right: TimelineSelectionRect) {
  return (
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top
  );
}

function pointInside(point: { x: number; y: number }, rect: TimelineSelectionRect) {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

function mergeSelectionItems(left: ArrangementSelectionItem[], right: ArrangementSelectionItem[]) {
  const items = new Map(left.map((item) => [arrangementSelectionItemKey(item), item]));
  for (const item of right) items.set(arrangementSelectionItemKey(item), item);
  return [...items.values()];
}
