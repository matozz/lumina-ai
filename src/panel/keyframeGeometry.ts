import type { KeyframeDSL, ParameterDefinitionDSL, ParameterValueDSL } from "@/bridge/types";

const MAX_TICK = 0xffff_ffff;

export interface KeyframeMoveBounds {
  maximum: number;
  minimum: number;
}

export function keyframeMoveBounds(
  keyframes: KeyframeDSL[],
  selectedIds: ReadonlySet<string>,
): KeyframeMoveBounds {
  let minimum = -MAX_TICK;
  let maximum = MAX_TICK;
  for (let index = 0; index < keyframes.length; index += 1) {
    const keyframe = keyframes[index];
    if (!selectedIds.has(keyframe.id)) continue;
    minimum = Math.max(minimum, -keyframe.time_tick);
    maximum = Math.min(maximum, MAX_TICK - keyframe.time_tick);

    for (let previous = index - 1; previous >= 0; previous -= 1) {
      if (!selectedIds.has(keyframes[previous].id)) {
        minimum = Math.max(minimum, keyframes[previous].time_tick + 1 - keyframe.time_tick);
        break;
      }
    }
    for (let next = index + 1; next < keyframes.length; next += 1) {
      if (!selectedIds.has(keyframes[next].id)) {
        maximum = Math.min(maximum, keyframes[next].time_tick - 1 - keyframe.time_tick);
        break;
      }
    }
  }
  return { minimum, maximum };
}

export function clampKeyframeDelta(deltaTick: number, bounds: KeyframeMoveBounds): number {
  return Math.max(bounds.minimum, Math.min(bounds.maximum, deltaTick));
}

export function clampKeyframeDeltaToSnap(
  deltaTick: number,
  bounds: KeyframeMoveBounds,
  anchorTick: number,
  snapTicks: number,
): number {
  const interval = Math.max(1, Math.round(snapTicks));
  const minimumTarget = Math.ceil((anchorTick + bounds.minimum) / interval) * interval;
  const maximumTarget = Math.floor((anchorTick + bounds.maximum) / interval) * interval;
  if (minimumTarget > maximumTarget) return 0;
  const requestedTarget = anchorTick + deltaTick;
  return Math.max(minimumTarget, Math.min(maximumTarget, requestedTarget)) - anchorTick;
}

export function keyframeValueY(
  value: ParameterValueDSL,
  definition: ParameterDefinitionDSL,
  height: number,
  inset = 4,
): number {
  if (value.type !== "scalar") return height / 2;
  const [minimum, maximum] = definition.range ?? [0, 1];
  if (maximum <= minimum) return height / 2;
  const progress = Math.max(0, Math.min(1, (value.value - minimum) / (maximum - minimum)));
  const safeInset = Math.max(0, Math.min(height / 2, inset));
  return height - safeInset - progress * (height - safeInset * 2);
}

export function keyframeTransform(translateX: number): string {
  return `translate(calc(-50% + ${translateX}px), -50%) rotate(45deg)`;
}
