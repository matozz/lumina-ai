import { AuthoringTransportError } from "./transport";

export interface AuthoringDiagnostic {
  code: string;
  severity: "error" | "warning";
  path: string;
  message: string;
  hint: string;
}

export function authoringDiagnostic(
  error: unknown,
  path: string,
  fallback = "The authoring action could not be completed.",
): AuthoringDiagnostic {
  if (error instanceof AuthoringTransportError) {
    return {
      code: error.code,
      severity: "error",
      path,
      message: error.message,
      hint: error.hint,
    };
  }
  return {
    code: "AUTHORING_ACTION_FAILED",
    severity: "error",
    path,
    message: error instanceof Error ? error.message : fallback,
    hint: "Review the selected asset and retry the action.",
  };
}
