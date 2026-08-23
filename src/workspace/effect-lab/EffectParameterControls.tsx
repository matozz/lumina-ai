import { Palette, RotateCcw, X } from "lucide-react";
import type { Diagnostic, ParameterDefinitionDSL, ParameterValueDSL } from "@/bridge/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { parameterAutomation, parameterDefaultValue } from "@/document/effectParameter";
import { EffectParameterInput } from "./EffectParameterInput";

export function EffectParameterControls({
  parameters,
  diagnostics,
  readOnly,
  parameterIndices,
  showMetadata = false,
  values,
  speedLabel,
  onChange,
  onOptionalEnabledChange,
  onRestoreLastValid,
}: {
  parameters: ParameterDefinitionDSL[];
  diagnostics: Diagnostic[];
  readOnly: boolean;
  parameterIndices?: Record<string, number>;
  showMetadata?: boolean;
  values?: Record<string, ParameterValueDSL | undefined>;
  speedLabel?: (value: number) => string;
  onChange: (parameterId: string, value: ParameterValueDSL) => void;
  onOptionalEnabledChange?: (parameterId: string, enabled: boolean) => void;
  onRestoreLastValid: (parameterId: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {parameters.map((parameter, index) => {
        const sourceIndex = parameterIndices?.[parameter.id] ?? index;
        const parameterDiagnostics = diagnostics.filter((diagnostic) =>
          diagnostic.path.includes(`parameters[${sourceIndex}]`),
        );
        const value = values ? values[parameter.id] : parameterDefaultValue(parameter);
        const optionalColorDisabled = parameter.schema.type === "color" && value === undefined;
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
              {showMetadata && (
                <>
                  <Badge variant="secondary" className="ml-auto">
                    {parameter.scope}
                  </Badge>
                  <Badge variant="outline">{parameterAutomation(parameter)}</Badge>
                </>
              )}
            </div>
            {optionalColorDisabled ? (
              <div className="border-border/70 bg-muted/20 flex h-7 min-w-0 items-center gap-2 rounded-md border px-2">
                <Palette className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-[10px]">
                  Use Effect color
                </span>
                {onOptionalEnabledChange && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px]"
                    disabled={readOnly}
                    onClick={() => onOptionalEnabledChange(parameter.id, true)}
                  >
                    Choose color
                  </Button>
                )}
              </div>
            ) : value ? (
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <EffectParameterInput
                    parameter={parameter}
                    value={value}
                    readOnly={readOnly}
                    speedLabel={speedLabel}
                    onChange={(value) => onChange(parameter.id, value)}
                  />
                </div>
                {parameter.schema.type === "color" && onOptionalEnabledChange && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-muted-foreground shrink-0"
                    disabled={readOnly}
                    aria-label={`Clear ${parameter.name} color`}
                    title="Use Effect color"
                    onClick={() => onOptionalEnabledChange(parameter.id, false)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
              </div>
            ) : null}
            <FieldDescription>{parameter.help}</FieldDescription>
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
            {parameterDiagnostics.length > 0 && !readOnly && (
              <Button size="xs" variant="outline" onClick={() => onRestoreLastValid(parameter.id)}>
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
                Restore last valid value
              </Button>
            )}
          </Field>
        );
      })}
    </div>
  );
}
