import type { EffectTempoBehaviorDSL, PrimaryVisualEventDSL } from "@/bridge/types";
import { speedMultiplierLabel } from "@/authoring/speedMultipliers";

const PRIMARY_EVENT_LABELS: Record<PrimaryVisualEventDSL, string> = {
  pulse_onset: "onset",
  one_way_traversal: "traversal",
  directional_traversal: "directional traversal",
  random_refresh: "refresh",
  rise_fall_cycle: "rise-fall cycle",
  color_cycle: "color cycle",
  movement_cycle: "movement cycle",
  spatial_propagation: "propagation",
};

export function primaryEventLabel(event: PrimaryVisualEventDSL) {
  return PRIMARY_EVENT_LABELS[event];
}

export function formatTemporalSpeedLabel(
  behavior: EffectTempoBehaviorDSL,
  speed: number,
  bpm: number,
) {
  const eventsPerBeat = speed;
  const eventsPerSecond = (eventsPerBeat * bpm) / 60;
  return `${speedMultiplierLabel(speed)} · ${formatRate(eventsPerBeat)} ${primaryEventLabel(behavior.primary_event)}/beat · ${formatRate(eventsPerSecond)} events/s`;
}

export function formatRate(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}
