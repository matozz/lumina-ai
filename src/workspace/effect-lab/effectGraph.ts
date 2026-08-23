import type {
  EffectDefinitionDSL,
  EffectNodeDSL,
  EffectTempoBehaviorDSL,
  OscillatorWaveformDSL,
  ParameterDefinitionDSL,
  SequenceStepDSL,
} from "@/bridge/types";
import type { EffectFormValues } from "./effectFactory";

export function buildCommonParameters(values: EffectFormValues): ParameterDefinitionDSL[] {
  return [
    scalarParameter("speed", "Speed", values.speed, [0.25, 8], "multiplier"),
    scalarParameter("phase", "Phase", values.phase, [-1, 1], "cycles"),
    scalarParameter("intensity", "Intensity", 1, [0, 1], "normalized"),
    {
      id: "color",
      name: "Color",
      schema: {
        type: "color",
        ...(values.attributeMode === "intensity_color" ? { default: values.color } : {}),
      },
      scope: "arrangement",
      section: "main",
      help: "Single-color output used by this Effect and available to Cue or Arrangement overrides.",
    },
    {
      id: "direction",
      name: "Direction",
      schema: { type: "direction", default: "forward" },
      scope: "arrangement",
      section: "main",
      help: "Playback direction.",
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

export function buildTempoBehavior(_values: EffectFormValues): EffectTempoBehaviorDSL {
  return {
    primary_event: "rise_fall_cycle",
    events_per_graph_cycle: 1,
  };
}

export function waveformFromDefinition(
  definition: EffectDefinitionDSL,
  waveforms: OscillatorWaveformDSL[],
): OscillatorWaveformDSL {
  const node = definition.graph.nodes.find(
    (candidate) => candidate.type === "step_sequence" && candidate.id.startsWith("shape-"),
  );
  const waveform = node?.id.slice("shape-".length) as OscillatorWaveformDSL | undefined;
  return waveform && waveforms.includes(waveform) ? waveform : "triangle";
}

function waveformSteps(values: EffectFormValues): SequenceStepDSL[] {
  const sampleCount = 16;
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
    schema: {
      type: "scalar",
      default: value,
      range: { min: range[0], max: range[1], step: id === "speed" ? 0.25 : 0.05 },
      unit,
    },
    scope: "arrangement",
    section: "main",
    help: `${name} control.`,
  };
}
