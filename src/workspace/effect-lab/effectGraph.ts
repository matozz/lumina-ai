import type {
  EffectDefinitionDSL,
  EffectNodeDSL,
  OscillatorWaveformDSL,
  ParameterDefinitionDSL,
  ParameterValueDSL,
  SequenceStepDSL,
} from "@/bridge/types";
import type { EffectFormValues } from "./effectFactory";

export function buildCommonParameters(values: EffectFormValues): ParameterDefinitionDSL[] {
  return [
    scalarParameter("speed", "Speed", values.speed, [0.25, 8], "multiplier"),
    scalarParameter("phase", "Phase", values.phase, [-1, 1], "cycles"),
    scalarParameter("width", "Width", values.width, [1, 100], "percent"),
    scalarParameter("transition", "Transition", values.transition, [0, 100], "percent"),
    scalarParameter("intensity", "Intensity", 1, [0, 1], "normalized"),
    {
      id: "color",
      name: "Color",
      value_type: "color",
      default_value: { type: "color", value: values.color },
      required: true,
      help: "Single-color output used by this Effect and available to Cue or Arrangement overrides.",
      safe_fallback: { type: "color", value: "#FFFFFF" },
      override_policy: "cue_override",
      advanced: false,
      unit: "color",
      ui_hint: "color",
      automation: "continuous",
    },
    {
      id: "direction",
      name: "Direction",
      value_type: "direction",
      default_value: { type: "direction", value: "forward" },
      required: true,
      help: "Playback direction.",
      safe_fallback: { type: "direction", value: "forward" },
      override_policy: "cue_override",
      advanced: false,
      unit: "direction",
      ui_hint: "segmented",
      automation: "discrete",
    },
  ];
}

export function buildEffectGraph(values: EffectFormValues): EffectNodeDSL[] {
  return [
    { type: "time", id: "time" },
    {
      type: "spatial_phase",
      id: "spatial",
      input: { node_id: "time", port: "scalar" },
      basis: "index",
      from: 0,
      to: 0,
      wrap: true,
    },
    {
      type: "step_sequence",
      id: `shape-${values.waveform}`,
      phase: { node_id: "spatial", port: "scalar" },
      steps: waveformSteps(values),
    },
    {
      type: "attribute_writer",
      id: "output",
      input: { node_id: `shape-${values.waveform}`, port: "attribute_set" },
    },
  ];
}

export function waveformFromDefinition(
  definition: EffectDefinitionDSL,
  waveforms: OscillatorWaveformDSL[],
): OscillatorWaveformDSL {
  const node = definition.graph.nodes.find(
    (candidate) => candidate.type === "step_sequence" && candidate.id.startsWith("shape-"),
  );
  const waveform = node?.id.slice("shape-".length) as OscillatorWaveformDSL | undefined;
  return waveform && waveforms.includes(waveform) ? waveform : "pulse";
}

function waveformSteps(values: EffectFormValues): SequenceStepDSL[] {
  const sampleCount = values.waveform === "pulse" ? 8 : 16;
  return Array.from({ length: sampleCount }, (_, index) => {
    const phase = index / sampleCount;
    const dimmer = waveformValue(values.waveform, phase);
    return {
      values: {
        dimmer,
        ...(values.attributeMode === "intensity_color" ? { color: values.color } : {}),
      },
      width: 100 / sampleCount,
      transition: 100,
    };
  });
}

function waveformValue(waveform: OscillatorWaveformDSL, phase: number) {
  if (waveform === "sine") return (Math.sin(phase * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  if (waveform === "triangle") return 1 - Math.abs(phase * 2 - 1);
  if (waveform === "saw") return phase;
  return phase < 0.5 ? 1 : 0;
}

function scalarParameter(
  id: string,
  name: string,
  value: number,
  range: [number, number],
  unit: "multiplier" | "cycles" | "percent" | "normalized",
): ParameterDefinitionDSL {
  return {
    id,
    name,
    value_type: "scalar",
    default_value: scalar(value),
    range,
    required: true,
    help: `${name} control.`,
    safe_fallback: scalar(value),
    override_policy: "cue_override",
    advanced: false,
    unit,
    ui_hint: "slider",
    automation: "continuous",
  };
}

function scalar(value: number): ParameterValueDSL {
  return { type: "scalar", value };
}
