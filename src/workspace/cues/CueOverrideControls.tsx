import type {
  CueDefinition,
  CueLayer,
  EffectDefinitionDocument,
  ParameterDefinitionDSL,
} from "@/bridge/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { uniqueId } from "@/document/projectModel";
import { EffectParameterControls } from "../effect-lab/EffectParameterControls";
import type { CueLayerUpdate } from "./cueAuthoring";

export function CueOverrideControls({
  cue,
  layer,
  effect,
  onUpdate,
  advanced,
}: {
  cue: CueDefinition;
  layer: CueLayer;
  effect: EffectDefinitionDocument;
  onUpdate: (update: CueLayerUpdate) => void;
  advanced: boolean;
}) {
  const overrideable = effect.parameters.filter(
    (parameter) => parameter.override_policy === "cue_override",
  );
  if (overrideable.length === 0) {
    return <FieldDescription>This Effect exposes no Cue-overridable parameters.</FieldDescription>;
  }
  return (
    <div className="grid gap-2">
      {overrideable.map((parameter) => {
        const override = layer.parameter_overrides?.[parameter.id];
        const lane = cue.automation_lanes?.find(
          (candidate) =>
            candidate.target.layer_id === layer.id &&
            candidate.target.parameter_id === parameter.id,
        );
        const displayed: ParameterDefinitionDSL = {
          ...parameter,
          default_value: structuredClone(override ?? parameter.default_value),
        };
        return (
          <div key={parameter.id} className="grid gap-1.5">
            {advanced && (
              <div className="flex items-center gap-1.5">
                <Badge variant={override ? "secondary" : "outline"}>
                  {override ? "override" : "Effect default"}
                </Badge>
                {override && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      onUpdate((draftLayer) => {
                        const overrides = { ...(draftLayer.parameter_overrides ?? {}) };
                        delete overrides[parameter.id];
                        draftLayer.parameter_overrides = overrides;
                      })
                    }
                  >
                    Use default
                  </Button>
                )}
                {parameter.automation !== "disabled" && (
                  <Button
                    size="xs"
                    variant={lane ? "secondary" : "outline"}
                    className="ml-auto"
                    onClick={() =>
                      onUpdate((draftLayer, draftCue) =>
                        toggleAutomation(draftLayer, draftCue, parameter, override, lane?.id),
                      )
                    }
                  >
                    {lane ? "Automated" : "Add automation"}
                  </Button>
                )}
              </div>
            )}
            <EffectParameterControls
              parameters={[displayed]}
              diagnostics={[]}
              readOnly={false}
              onChange={(_, value) =>
                onUpdate((draftLayer) => {
                  draftLayer.parameter_overrides = {
                    ...(draftLayer.parameter_overrides ?? {}),
                    [parameter.id]: structuredClone(value),
                  };
                })
              }
              onRestoreFallback={() => undefined}
              showMetadata={advanced}
            />
          </div>
        );
      })}
    </div>
  );
}

function toggleAutomation(
  layer: CueLayer,
  cue: CueDefinition,
  parameter: ParameterDefinitionDSL,
  override: ParameterDefinitionDSL["default_value"] | undefined,
  laneId: string | undefined,
) {
  if (laneId) {
    cue.automation_lanes = (cue.automation_lanes ?? []).filter(
      (candidate) => candidate.id !== laneId,
    );
    return;
  }
  const value = structuredClone(override ?? parameter.default_value);
  cue.automation_lanes = [
    ...(cue.automation_lanes ?? []),
    {
      id: uniqueId(
        `${layer.id}-${parameter.id}-automation`,
        (cue.automation_lanes ?? []).map((candidate) => candidate.id),
      ),
      target: { layer_id: layer.id, parameter_id: parameter.id },
      keyframes: [
        { id: "start", time_tick: 0, value, interpolation: "linear" },
        {
          id: "end",
          time_tick: cue.nominal_length_ticks,
          value: structuredClone(value),
          interpolation: "linear",
        },
      ],
    },
  ];
}
