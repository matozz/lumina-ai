import { Palette, RotateCcw, X } from "lucide-react";
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
  onDefaultEnabledChange,
  onRestoreFallback,
}: {
  parameters: ParameterDefinitionDSL[];
  diagnostics: Diagnostic[];
  readOnly: boolean;
  parameterIndices?: Record<string, number>;
  showMetadata?: boolean;
  onChange: (parameterId: string, value: ParameterValueDSL) => void;
  onDefaultEnabledChange?: (parameterId: string, enabled: boolean) => void;
  onRestoreFallback: (parameterId: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {parameters.map((parameter, index) => {
        const sourceIndex = parameterIndices?.[parameter.id] ?? index;
        const parameterDiagnostics = diagnostics.filter((diagnostic) =>
          diagnostic.path.includes(`parameters[${sourceIndex}]`),
        );
        const optionalColorDisabled =
          parameter.value_type === "color" && parameter.default_enabled === false;
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
            {optionalColorDisabled ? (
              <div className="border-border/70 bg-muted/20 flex h-7 min-w-0 items-center gap-2 rounded-md border px-2">
                <Palette className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-[10px]">
                  Use Effect color
                </span>
                {onDefaultEnabledChange && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px]"
                    disabled={readOnly}
                    onClick={() => onDefaultEnabledChange(parameter.id, true)}
                  >
                    Choose color
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <EffectParameterInput
                    parameter={parameter}
                    readOnly={readOnly}
                    onChange={(value) => onChange(parameter.id, value)}
                  />
                </div>
                {parameter.value_type === "color" && onDefaultEnabledChange && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-muted-foreground shrink-0"
                    disabled={readOnly}
                    aria-label={`Clear ${parameter.name} color`}
                    title="Use Effect color"
                    onClick={() => onDefaultEnabledChange(parameter.id, false)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
              </div>
            )}
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
