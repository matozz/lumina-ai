export const BEAT_SYNC_SPEED_MULTIPLIERS = [0.25, 0.5, 1, 2, 4, 8] as const;

export function isBeatSyncSpeedMultiplier(value: number) {
  return BEAT_SYNC_SPEED_MULTIPLIERS.some((multiplier) => multiplier === value);
}

export function speedMultiplierLabel(value: number) {
  return `${value}×`;
}
