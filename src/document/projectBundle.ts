import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import schema from "../../schemas/project-bundle-v1.schema.json";
import type { ProjectBundle } from "@/generated/project-contract-v1";
import type { SchemaIssue } from "./showDocument";

export type ProjectBundleValidation =
  | { success: true; data: ProjectBundle; issues: [] }
  | { success: false; data: null; issues: SchemaIssue[] };

const validator = new Ajv2020({ allErrors: true, strict: true });
validator.addFormat("uint8", {
  type: "number",
  validate: (value: number) => Number.isInteger(value) && value >= 0 && value <= 0xff,
});
validator.addFormat("uint32", {
  type: "number",
  validate: (value: number) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff,
});
validator.addFormat("int32", {
  type: "number",
  validate: (value: number) =>
    Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff,
});
validator.addFormat("float", { type: "number", validate: Number.isFinite });
validator.addFormat("double", { type: "number", validate: Number.isFinite });

const validate = validator.compile<ProjectBundle>(schema);

export const projectBundleSchema = schema;
export const projectBundleSchemaUri = "https://lumina.local/schema/project-bundle-v1.json";

export function validateProjectBundle(value: unknown): ProjectBundleValidation {
  if (validate(value)) return { success: true, data: value, issues: [] };

  return {
    success: false,
    data: null,
    issues: (validate.errors ?? []).map(toSchemaIssue),
  };
}

function toSchemaIssue(error: ErrorObject): SchemaIssue {
  return {
    keyword: error.keyword,
    path: error.instancePath || "$",
    message: error.message ?? "does not match ProjectBundle v1",
  };
}
