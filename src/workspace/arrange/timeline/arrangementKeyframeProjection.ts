import type { ArrangementDocument } from "@/bridge/types";
import { keyframeMoveBounds, type KeyframeMoveBounds } from "@/panel/keyframeGeometry";
import type {
  ArrangementKeyframeSelectionItem,
  ArrangementSelectionItem,
} from "./arrangementSelection";

const EMPTY_IDS = new Set<string>();

export function keyframeSelectionMoveBounds(
  arrangement: ArrangementDocument,
  items: ArrangementSelectionItem[],
): KeyframeMoveBounds {
  let minimum = Number.NEGATIVE_INFINITY;
  let maximum = Number.POSITIVE_INFINITY;
  let found = false;
  for (const track of arrangement.tracks) {
    for (const lane of track.automation_lanes ?? []) {
      const selectedIds = keyframeIdsForLane(items, track.id, lane.id);
      if (selectedIds.size === 0) continue;
      found = true;
      const laneBounds = keyframeMoveBounds(lane.keyframes, selectedIds);
      minimum = Math.max(minimum, laneBounds.minimum);
      maximum = Math.min(maximum, laneBounds.maximum);
      for (const keyframe of lane.keyframes) {
        if (!selectedIds.has(keyframe.id)) continue;
        minimum = Math.max(minimum, -keyframe.time_tick);
        maximum = Math.min(maximum, arrangement.length_ticks - 1 - keyframe.time_tick);
      }
    }
  }
  return found ? { minimum, maximum } : { minimum: 0, maximum: 0 };
}

export function keyframeIdsForLane(
  items: ArrangementSelectionItem[],
  trackId: string,
  laneId: string,
) {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.type === "keyframe" && item.trackId === trackId && item.laneId === laneId) {
      ids.add(item.keyframeId);
    }
  }
  return ids;
}

export function keyframeProjectionGroups(items: ArrangementSelectionItem[]) {
  const groups = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.type !== "keyframe") continue;
    const key = keyframeLaneKey(item);
    const ids = groups.get(key) ?? new Set<string>();
    ids.add(item.keyframeId);
    groups.set(key, ids);
  }
  return groups;
}

export function projectRegisteredKeyframeLanes(
  controllers: ReadonlyMap<
    string,
    (selectedIds: ReadonlySet<string>, deltaTick: number) => void
  >,
  items: ArrangementSelectionItem[],
  deltaTick: number,
) {
  const groups = keyframeProjectionGroups(items);
  for (const [key, project] of controllers) {
    project(groups.get(key) ?? EMPTY_IDS, deltaTick);
  }
}

export function keyframeLaneKey(
  itemOrTrackId: ArrangementKeyframeSelectionItem | string,
  laneId?: string,
) {
  return typeof itemOrTrackId === "string"
    ? `${itemOrTrackId}\u0000${laneId ?? ""}`
    : `${itemOrTrackId.trackId}\u0000${itemOrTrackId.laneId}`;
}

export function emptyKeyframeProjectionIds() {
  return EMPTY_IDS;
}
