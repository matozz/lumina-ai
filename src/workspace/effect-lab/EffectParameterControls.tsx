import { RotateCcw } from "lucide-react";
import type { Diagnostic, ParameterDefinitionDSL, ParameterValueDSL } from "@/bridge/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { EffectParameterInput } from "./EffectParameterInput";

export function EffectParameterControls({
  parameters,
  diagnostics,
  readOnly,
  parameterIndices,
  showMetadata = false,
  onChange,
  onRestoreFallback,
}: {
  parameters: ParameterDefinitionDSL[];
  diagnostics: Diagnostic[];
  readOnly: boolean;
  parameterIndices?: Record<string, number>;
  showMetadata?: boolean;
  onChange: (parameterId: string, value: ParameterValueDSL) => void;
  onRestoreFallback: (parameterId: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {parameters.map((parameter, index) => {
        const sourceIndex = parameterIndices?.[parameter.id] ?? index;
        const parameterDiagnostics = diagnostics.filter((diagnostic) =>
          diagnostic.path.includes(`parameters[${sourceIndex}]`),
        );
        return (
          <Field
            key={parameter.id}
            className="border-border bg-background/40 min-w-0 rounded-md border p-2.5"
            aria-invalid={parameterDiagnostics.length > 0}
          >
            <div
              className="flex min-w-0 flex-wrap items-center gap-1.5"
              data-layout-region="effect-parameter-header"
            >
              <FieldLabel htmlFor={`effect-parameter-${parameter.id}`} className="text-xs">
                {parameter.name}
              </FieldLabel>
              {showMetadata && parameter.required && <Badge variant="outline">required</Badge>}
              {showMetadata && (
                <>
                  <Badge variant="secondary" className="ml-auto">
                    {parameter.override_policy?.replace("_", " ") ?? "effect only"}
                  </Badge>
                  <Badge variant="outline">{parameter.automation}</Badge>
                </>
              )}
            </div>
            <EffectParameterInput
              parameter={parameter}
              readOnly={readOnly}
              onChange={(value) => onChange(parameter.id, value)}
            />
            {parameter.help && <FieldDescription>{parameter.help}</FieldDescription>}
            {showMetadata && parameter.graph_binding && (
              <FieldDescription>
                Typed binding · {parameter.graph_binding.node_id}.{parameter.graph_binding.property}
              </FieldDescription>
            )}
            {parameterDiagnostics.map((diagnostic) => (
              <div key={`${diagnostic.code}:${diagnostic.path}`} className="grid gap-1">
                <p className="text-destructive text-[10px]" role="alert">
                  {diagnostic.message}
                </p>
                {diagnostic.hint && (
                  <p className="text-muted-foreground text-[10px]">{diagnostic.hint}</p>
                )}
              </div>
            ))}
            {parameter.safe_fallback && parameterDiagnostics.length > 0 && !readOnly && (
              <Button size="xs" variant="outline" onClick={() => onRestoreFallback(parameter.id)}>
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
                Restore safe fallback
              </Button>
            )}
          </Field>
        );
      })}
    </div>
  );
}
