import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import schema from "../../schemas/show-document-v3.schema.json";
import type { ShowDocumentV3 } from "@/generated/show-document-v3";

export interface SchemaIssue {
  keyword: string;
  path: string;
  message: string;
}

export type ShowDocumentValidation =
  | { success: true; data: ShowDocumentV3; issues: [] }
  | { success: false; data: null; issues: SchemaIssue[] };

const validator = new Ajv2020({ allErrors: true, strict: true });
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

const validate = validator.compile<ShowDocumentV3>(schema);

export const showDocumentSchema = schema;
export const showDocumentSchemaUri = "https://lumina.local/schema/show-document-v3.json";

export function validateShowDocument(value: unknown): ShowDocumentValidation {
  if (validate(value)) {
    return { success: true, data: value, issues: [] };
  }

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
    message: error.message ?? "does not match ShowDocumentV3",
  };
}
