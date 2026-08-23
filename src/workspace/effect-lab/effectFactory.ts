import type {
  EffectDefinitionDSL,
  EffectInstanceDSL,
  FullDSL,
  OscillatorWaveformDSL,
  ParameterValueDSL,
} from "@/bridge/types";
import { parameterDefaultValue } from "@/document/effectParameter";
import {
  buildCommonParameters,
  buildEffectGraph,
  buildTempoBehavior,
  waveformFromDefinition,
} from "./effectGraph";

export type EffectAttributeMode = "intensity_color" | "intensity";

export interface EffectFormValues {
  name: string;
  targetGroupId: string;
  attributeMode: EffectAttributeMode;
  waveform: OscillatorWaveformDSL;
  speed: number;
  phase: number;
  color: string;
}

export interface EffectPair {
  definition: EffectDefinitionDSL;
  instance: EffectInstanceDSL;
}

export const effectWaveforms: OscillatorWaveformDSL[] = ["sine", "triangle"];

export function createEffectPair(document: FullDSL, name = "Smooth Accent"): EffectPair {
  const definitionId = uniqueId(
    `project.${slug(name)}`,
    document.effect_definitions.map(({ id }) => id),
  );
  const instanceId = uniqueId(
    `${definitionId}.instance`,
    document.effect_instances.map(({ id }) => id),
  );
  const values: EffectFormValues = {
    name,
    targetGroupId: document.groups[0]?.id ?? "all-fixtures",
    attributeMode: "intensity_color",
    waveform: "triangle",
    speed: 1,
    phase: 0,
    color: "#ff2d55",
  };
  return buildEffectPair(definitionId, instanceId, 1, values);
}

export function duplicateEffectPair(
  document: FullDSL,
  definition: EffectDefinitionDSL,
  instance: EffectInstanceDSL,
): EffectPair {
  const values = effectFormValues(definition, instance);
  values.name = `${values.name} Copy`;
  const definitionId = uniqueId(
    `project.${slug(values.name)}`,
    document.effect_definitions.map(({ id }) => id),
  );
  const instanceId = uniqueId(
    `${definitionId}.instance`,
    document.effect_instances.map(({ id }) => id),
  );
  return buildEffectPair(definitionId, instanceId, 1, values);
}

export function reviseEffectPair(
  definition: EffectDefinitionDSL,
  instance: EffectInstanceDSL,
  values: EffectFormValues,
): EffectPair {
  return buildEffectPair(definition.id, instance.id, definition.revision + 1, values);
}

export function effectFormValues(
  definition: EffectDefinitionDSL,
  instance: EffectInstanceDSL,
): EffectFormValues {
  return {
    name: definition.name,
    targetGroupId: instance.target_group_id,
    attributeMode: definition.catalog.required_attributes?.includes("color.rgb")
      ? "intensity_color"
      : "intensity",
    waveform: waveformFromDefinition(definition, effectWaveforms),
    speed: scalarValue(definition, instance, "speed", 1),
    phase: scalarValue(definition, instance, "phase", 0),
    color: colorValue(definition, instance),
  };
}

export function primaryInstance(document: FullDSL, definitionId: string) {
  return document.effect_instances.find((instance) => instance.definition_id === definitionId);
}

export function effectIsUsed(document: FullDSL, definitionId: string) {
  const instanceIds = new Set(
    document.effect_instances
      .filter((instance) => instance.definition_id === definitionId)
      .map((instance) => instance.id),
  );
  return Boolean(
    document.timeline?.tracks.some(
      (track) =>
        track.clips?.some((clip) => instanceIds.has(clip.instance_id)) ||
        track.automation_lanes?.some(
          (lane) =>
            lane.target.scope === "effect_instance" && instanceIds.has(lane.target.instance_id),
        ),
    ),
  );
}

function buildEffectPair(
  definitionId: string,
  instanceId: string,
  revision: number,
  values: EffectFormValues,
): EffectPair {
  const definition: EffectDefinitionDSL = {
    id: definitionId,
    name: values.name.trim(),
    revision,
    source: "project_local",
    parameters: buildCommonParameters(values),
    tempo: buildTempoBehavior(values),
    graph: { nodes: buildEffectGraph(values) },
    catalog: {
      mood: ["driving"],
      energy: 0.7,
      density: 0.7,
      motion: "organic",
      colorfulness: values.attributeMode === "intensity_color" ? 1 : 0,
      required_attributes:
        values.attributeMode === "intensity_color" ? ["intensity", "color.rgb"] : ["intensity"],
    },
  };
  const parameter_overrides: Record<string, ParameterValueDSL> = {
    speed: scalar(values.speed),
    phase: scalar(values.phase),
    intensity: scalar(1),
    direction: { type: "direction", value: "forward" },
  };
  if (values.attributeMode === "intensity_color") {
    parameter_overrides.color = { type: "color", value: values.color };
  }
  return {
    definition,
    instance: {
      id: instanceId,
      definition_id: definitionId,
      definition_revision: revision,
      target_group_id: values.targetGroupId,
      seed: stableSeed(instanceId),
      parameter_overrides,
    },
  };
}

function scalarValue(
  definition: EffectDefinitionDSL,
  instance: EffectInstanceDSL,
  id: string,
  fallback: number,
) {
  const override = instance.parameter_overrides?.[id];
  if (override?.type === "scalar") return override.value;
  const parameter = definition.parameters.find((parameter) => parameter.id === id);
  const defaultValue = parameter ? parameterDefaultValue(parameter) : undefined;
  return defaultValue?.type === "scalar" ? defaultValue.value : fallback;
}

function colorValue(definition: EffectDefinitionDSL, instance: EffectInstanceDSL) {
  const override = instance.parameter_overrides?.color;
  if (override?.type === "color") return override.value;
  const parameter = definition.parameters.find((parameter) => parameter.id === "color");
  const defaultValue = parameter ? parameterDefaultValue(parameter) : undefined;
  return defaultValue?.type === "color" ? defaultValue.value : "#ffffff";
}

function scalar(value: number): ParameterValueDSL {
  return { type: "scalar", value };
}

function uniqueId(base: string, existing: string[]) {
  let candidate = base;
  let suffix = 2;
  while (existing.includes(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function slug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "effect"
  );
}

function stableSeed(value: string) {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
