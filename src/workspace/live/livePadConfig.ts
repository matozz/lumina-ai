import type { LiveEffectInfo } from "@/bridge/types";
import type { LivePadConfig } from "@/stores/workspace";

export const defaultLivePadConfig: LivePadConfig = {
  mode: "toggle",
  exclusiveGroup: "",
  oneShotBeats: 4,
};

export function configFor(effectId: string, configs: Record<string, LivePadConfig>): LivePadConfig {
  return configs[effectId] ?? defaultLivePadConfig;
}

export function exclusiveEffectIds(
  effect: LiveEffectInfo,
  effects: LiveEffectInfo[],
  configs: Record<string, LivePadConfig>,
) {
  const group = configFor(effect.instance_id, configs).exclusiveGroup.trim();
  if (!group) return [];
  return effects
    .filter(
      (candidate) =>
        candidate.instance_id !== effect.instance_id &&
        configFor(candidate.instance_id, configs).exclusiveGroup.trim() === group,
    )
    .map((candidate) => candidate.instance_id);
}
