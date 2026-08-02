import type { AutomationTargetV3DSL } from "@/generated/show-document-v4";

export function automationTargetPath(target: AutomationTargetV3DSL): string {
  return target.scope === "global"
    ? `global.${target.parameter_id}`
    : `phaser:${target.instance_id}.${target.parameter_id}`;
}

export function automationTargetParentTrack(target: AutomationTargetV3DSL): string {
  return target.scope === "global" ? "global" : `phaser:${target.instance_id}`;
}
