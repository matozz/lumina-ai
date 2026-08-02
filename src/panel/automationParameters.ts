import type {
  AutomationTargetV3DSL,
  FullDSL,
  ParameterDefinitionDSL,
  ParameterValueDSL,
} from "@/bridge/types";
import { automationTargetParentTrack, automationTargetPath } from "@/document/automationTarget";

export interface AutomationParameterOption {
  definition: ParameterDefinitionDSL;
  initialValue: ParameterValueDSL;
  target: AutomationTargetV3DSL;
}

const MASTER_DIMMER: ParameterDefinitionDSL = {
  id: "master_dimmer",
  name: "Master dimmer",
  value_type: "scalar",
  default_value: { type: "scalar", value: 1 },
  range: [0, 1],
  unit: "percent",
  ui_hint: "slider",
  automation: "continuous",
};

export function automationParameterOptions(
  document: FullDSL | null,
  parentTrackId: string,
): AutomationParameterOption[] {
  if (!document) return [];
  const existingTargets = new Set(
    document.timeline?.tracks.flatMap((track) =>
      (track.automation_lanes ?? []).map((lane) => automationTargetPath(lane.target)),
    ) ?? [],
  );
  const options =
    parentTrackId === "global"
      ? [
          {
            definition: MASTER_DIMMER,
            initialValue: MASTER_DIMMER.default_value,
            target: {
              scope: "global" as const,
              parameter_id: "master_dimmer" as const,
            },
          },
        ]
      : effectParameterOptions(document, parentTrackId);

  return options
    .filter((option) => automationTargetParentTrack(option.target) === parentTrackId)
    .filter((option) => !existingTargets.has(automationTargetPath(option.target)))
    .map((option) => ({ ...option, initialValue: structuredClone(option.initialValue) }))
    .sort((left, right) => left.definition.name.localeCompare(right.definition.name));
}

export function resolveAutomationParameter(
  document: FullDSL | null,
  target: AutomationTargetV3DSL,
): AutomationParameterOption | undefined {
  if (!document) return undefined;
  if (target.scope === "global") {
    return target.parameter_id === "master_dimmer"
      ? {
          definition: MASTER_DIMMER,
          initialValue: structuredClone(MASTER_DIMMER.default_value),
          target,
        }
      : undefined;
  }
  return effectParameterOptions(document, `phaser:${target.instance_id}`).find(
    (option) => option.target.parameter_id === target.parameter_id,
  );
}

function effectParameterOptions(
  document: FullDSL,
  parentTrackId: string,
): AutomationParameterOption[] {
  if (!parentTrackId.startsWith("phaser:")) return [];
  const instanceId = parentTrackId.slice("phaser:".length);
  const instance = document.effect_instances.find((candidate) => candidate.id === instanceId);
  if (!instance) return [];
  const definition = document.effect_definitions.find(
    (candidate) =>
      candidate.id === instance.definition_id &&
      candidate.revision === instance.definition_revision,
  );
  if (!definition) return [];

  return definition.parameters.map((parameter) => ({
    definition: parameter,
    initialValue: instance.parameter_overrides?.[parameter.id] ?? parameter.default_value,
    target: {
      scope: "effect_instance",
      instance_id: instance.id,
      parameter_id: parameter.id,
    },
  }));
}
