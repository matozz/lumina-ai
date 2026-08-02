import type { AutomationTargetDSL } from "@/generated/show-document-v1";

export function automationTargetPath(target: AutomationTargetDSL): string {
  return target.scope === "global"
    ? `global.${target.parameter_id}`
    : `phaser:${target.instance_id}.${target.parameter_id}`;
}

export function automationTargetParentTrack(target: AutomationTargetDSL): string {
  return target.scope === "global" ? "global" : `phaser:${target.instance_id}`;
}
