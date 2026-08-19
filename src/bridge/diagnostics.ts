import type { Diagnostic } from "./types";

const FALLBACK_CODE = "DSL_COMPILE_REQUEST_FAILED";

export function normalizeDiagnostic(error: unknown): Diagnostic {
  if (isDiagnostic(error)) {
    return error;
  }

  return {
    code: FALLBACK_CODE,
    severity: "error",
    path: "$",
    message: error instanceof Error ? error.message : String(error),
    hint: "Check the DSL and retry. If the error persists, reload the editor.",
  };
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const hint = diagnostic.hint ? `\nHint: ${diagnostic.hint}` : "";
  return `[${diagnostic.code}] ${diagnostic.path}\n${diagnostic.message}${hint}`;
}

export function formatDiagnosticError(error: unknown): string {
  const diagnostics = Array.isArray(error) ? error : [error];
  return diagnostics.map((item) => formatDiagnostic(normalizeDiagnostic(item))).join("\n");
}

function isDiagnostic(value: unknown): value is Diagnostic {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Diagnostic>;
  return (
    typeof candidate.code === "string" &&
    (candidate.severity === "error" || candidate.severity === "warning") &&
    typeof candidate.path === "string" &&
    typeof candidate.message === "string" &&
    (typeof candidate.hint === "string" || candidate.hint === null)
  );
}
