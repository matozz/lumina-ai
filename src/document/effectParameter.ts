import type { ParameterDefinitionDSL, ParameterValueDSL } from "@/bridge/types";

export type ParameterValueType = ParameterValueDSL["type"];
export type ParameterAutomation = "continuous" | "discrete" | "disabled";

export function parameterValueType(parameter: ParameterDefinitionDSL): ParameterValueType {
  return parameter.schema.type;
}

export function parameterDefaultValue(
  parameter: ParameterDefinitionDSL,
): ParameterValueDSL | undefined {
  const schema = parameter.schema;
  switch (schema.type) {
    case "scalar":
      return { type: "scalar", value: schema.default };
    case "color":
      return schema.default ? { type: "color", value: schema.default } : undefined;
    case "direction":
      return { type: "direction", value: schema.default };
    case "boolean":
      return { type: "boolean", value: schema.default };
    case "enum":
      return { type: "enum", value: schema.default };
    case "color_stops":
      return { type: "color_stops", value: structuredClone(schema.default) };
  }
}

export function parameterInitialValue(parameter: ParameterDefinitionDSL): ParameterValueDSL {
  return parameterDefaultValue(parameter) ?? { type: "color", value: "#FFFFFF" };
}

export function setParameterDefaultValue(
  parameter: ParameterDefinitionDSL,
  value: ParameterValueDSL | undefined,
) {
  const schema = parameter.schema;
  if (value && value.type !== schema.type) {
    throw new Error(`Parameter ${parameter.id} expects ${schema.type}, received ${value.type}.`);
  }
  switch (schema.type) {
    case "scalar":
      if (value?.type === "scalar") schema.default = value.value;
      break;
    case "color":
      if (value?.type === "color") schema.default = value.value;
      else delete schema.default;
      break;
    case "direction":
      if (value?.type === "direction") schema.default = value.value;
      break;
    case "boolean":
      if (value?.type === "boolean") schema.default = value.value;
      break;
    case "enum":
      if (value?.type === "enum") schema.default = value.value;
      break;
    case "color_stops":
      if (value?.type === "color_stops") schema.default = structuredClone(value.value);
      break;
  }
}

export function parameterRange(parameter: ParameterDefinitionDSL): [number, number] | undefined {
  return parameter.schema.type === "scalar"
    ? [parameter.schema.range.min, parameter.schema.range.max]
    : undefined;
}

export function parameterStep(parameter: ParameterDefinitionDSL) {
  return parameter.schema.type === "scalar" ? parameter.schema.range.step : undefined;
}

export function parameterUnit(parameter: ParameterDefinitionDSL) {
  return parameter.schema.type === "scalar" ? parameter.schema.unit : parameter.schema.type;
}

export function parameterEnumValues(parameter: ParameterDefinitionDSL) {
  return parameter.schema.type === "enum" ? parameter.schema.values : [];
}

export function parameterAutomation(parameter: ParameterDefinitionDSL): ParameterAutomation {
  if (parameter.scope !== "arrangement" || parameter.schema.type === "color_stops") {
    return "disabled";
  }
  return parameter.schema.type === "scalar" || parameter.schema.type === "color"
    ? "continuous"
    : "discrete";
}

export function parameterAllowsCueOverride(parameter: ParameterDefinitionDSL) {
  return parameter.scope === "cue" || parameter.scope === "arrangement";
}

export function parameterAllowsAutomation(parameter: ParameterDefinitionDSL) {
  return parameterAutomation(parameter) !== "disabled";
}
