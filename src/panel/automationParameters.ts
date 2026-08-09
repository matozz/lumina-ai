import type {
  AutomationTargetDSL,
  FullDSL,
  ParameterDefinitionDSL,
  ParameterValueDSL,
} from "@/bridge/types";
import { automationTargetParentTrack, automationTargetPath } from "@/document/automationTarget";
import { parameterAllowsAutomation, parameterInitialValue } from "@/document/effectParameter";

export interface AutomationParameterOption {
  definition: ParameterDefinitionDSL;
  initialValue: ParameterValueDSL;
  target: AutomationTargetDSL;
}

const MASTER_DIMMER: ParameterDefinitionDSL = {
  id: "master_dimmer",
  name: "Master dimmer",
  schema: {
    type: "scalar",
    default: 1,
    range: { min: 0, max: 1, step: 0.01 },
    unit: "percent",
  },
  scope: "arrangement",
  section: "main",
  help: "Global output level.",
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
            initialValue: parameterInitialValue(MASTER_DIMMER),
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
  target: AutomationTargetDSL,
): AutomationParameterOption | undefined {
  if (!document) return undefined;
  if (target.scope === "global") {
    return target.parameter_id === "master_dimmer"
      ? {
          definition: MASTER_DIMMER,
          initialValue: parameterInitialValue(MASTER_DIMMER),
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

  return definition.parameters.filter(parameterAllowsAutomation).map((parameter) => ({
    definition: parameter,
    initialValue: instance.parameter_overrides?.[parameter.id] ?? parameterInitialValue(parameter),
    target: {
      scope: "effect_instance",
      instance_id: instance.id,
      parameter_id: parameter.id,
    },
  }));
}
