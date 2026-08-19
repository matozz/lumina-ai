import { describe, expect, it } from "vitest";
import { formatDiagnostic, formatDiagnosticError, normalizeDiagnostic } from "./diagnostics";

describe("diagnostic bridge", () => {
  it("preserves structured backend diagnostics", () => {
    const diagnostic = {
      code: "DSL_JSON_PARSE",
      severity: "error" as const,
      path: "line 2, column 3",
      message: "expected value",
      hint: "Fix the JSON syntax.",
    };

    expect(normalizeDiagnostic(diagnostic)).toBe(diagnostic);
    expect(formatDiagnostic(diagnostic)).toBe(
      "[DSL_JSON_PARSE] line 2, column 3\nexpected value\nHint: Fix the JSON syntax.",
    );
  });

  it("turns unknown invoke failures into visible diagnostics", () => {
    expect(normalizeDiagnostic(new Error("backend unavailable"))).toEqual({
      code: "DSL_COMPILE_REQUEST_FAILED",
      severity: "error",
      path: "$",
      message: "backend unavailable",
      hint: "Check the DSL and retry. If the error persists, reload the editor.",
    });
  });

  it("formats Tauri diagnostic arrays without object string coercion", () => {
    expect(
      formatDiagnosticError([
        {
          code: "TEMPORAL_ANALYSIS_REQUEST_INVALID",
          severity: "error",
          path: "temporal.request.seed",
          message: "Seed must be hexadecimal.",
          hint: "Use a deterministic 16-digit seed.",
        },
      ]),
    ).toBe(
      "[TEMPORAL_ANALYSIS_REQUEST_INVALID] temporal.request.seed\nSeed must be hexadecimal.\nHint: Use a deterministic 16-digit seed.",
    );
  });
});
