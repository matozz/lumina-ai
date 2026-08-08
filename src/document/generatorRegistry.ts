import type { LayoutGeometry } from "@/bridge/types";
import registrySource from "../../catalog/builtin/generators/registry-v1.json";

export type GeneratorShape = LayoutGeometry["shape"];
export type GeneratorStatus = "supported" | "read_only" | "unavailable";
export type GeneratorEditorMode = "form" | "parameter_schema" | "read_only" | "unavailable";
export type GeneratorParameterRole = "quantity" | "spacing" | "shape" | "source" | "appearance";
export type GeneratorParameterValueType =
  | "integer"
  | "number"
  | "choice"
  | "expression"
  | "coordinates"
  | "path";

export interface GeneratorParameterDescriptor {
  id: string;
  label: string;
  value_type: GeneratorParameterValueType;
  role: GeneratorParameterRole;
  minimum?: number;
  maximum?: number;
  step?: number;
}

export interface GeneratorDescriptor {
  shape: GeneratorShape;
  label: string;
  status: GeneratorStatus;
  editor_mode: GeneratorEditorMode;
  capacity_model: string;
  coordinate_model: string;
  validation_model: string;
  grid_targeting: boolean;
  parameter_schema: GeneratorParameterDescriptor[];
  default_parameters: Record<string, number>;
  preview: {
    mode: "full_geometry" | "saved_only";
    auto_fit: boolean;
  };
}

const ALL_GENERATOR_SHAPES = new Set<GeneratorShape>([
  "matrix",
  "wall",
  "strip",
  "frame",
  "circle",
  "sector",
  "polygon",
  "honeycomb",
  "formula",
  "algorithm",
  "custom",
  "svg_path",
]);

export const generatorRegistry = loadGeneratorRegistry();

export function generatorDescriptor(shape: GeneratorShape) {
  const descriptor = generatorRegistry.get(shape);
  if (!descriptor) throw new Error(`Generator Registry is missing ${shape}`);
  return descriptor;
}

function loadGeneratorRegistry() {
  if (registrySource.schema_version !== 1) {
    throw new Error("Generator Registry must use the current V1 contract");
  }
  const registry = new Map<GeneratorShape, GeneratorDescriptor>();
  for (const source of registrySource.generators) {
    if (!ALL_GENERATOR_SHAPES.has(source.shape as GeneratorShape)) {
      throw new Error(`Generator Registry contains an unknown shape: ${source.shape}`);
    }
    const descriptor = source as unknown as GeneratorDescriptor;
    if (registry.has(descriptor.shape)) {
      throw new Error(`Generator Registry contains a duplicate shape: ${descriptor.shape}`);
    }
    const parameterIds = new Set(descriptor.parameter_schema.map((parameter) => parameter.id));
    if (
      !descriptor.coordinate_model.trim() ||
      !descriptor.validation_model.trim() ||
      parameterIds.size !== descriptor.parameter_schema.length
    ) {
      throw new Error(`Generator Registry contains an incomplete descriptor: ${descriptor.shape}`);
    }
    if (
      descriptor.status === "supported" &&
      (!descriptor.parameter_schema.some((parameter) => parameter.role === "quantity") ||
        descriptor.preview.mode !== "full_geometry")
    ) {
      throw new Error(
        `Supported Generator is missing full authoring metadata: ${descriptor.shape}`,
      );
    }
    for (const id of Object.keys(descriptor.default_parameters)) {
      if (!parameterIds.has(id)) {
        throw new Error(`Generator default ${descriptor.shape}.${id} has no parameter schema`);
      }
    }
    registry.set(descriptor.shape, descriptor);
  }
  for (const shape of ALL_GENERATOR_SHAPES) {
    if (!registry.has(shape)) throw new Error(`Generator Registry is missing ${shape}`);
  }
  return registry;
}
