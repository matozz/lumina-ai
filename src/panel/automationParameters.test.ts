import { describe, expect, it } from "vitest";
import type { FullDSL } from "@/bridge/types";
import { automationParameterOptions, resolveAutomationParameter } from "./automationParameters";

function documentFixture(): FullDSL {
  return {
    schema_version: 1,
    meta: { name: "Automation parameters" },
    patch: [],
    layout: { type: "generator", generator: { shape: "custom", fixtures: [] } },
    groups: [],
    effect_definitions: [
      {
        id: "pulse",
        name: "Pulse",
        revision: 2,
        source: "project_local",
        catalog: {
          energy: 0.5,
          density: 0.5,
          colorfulness: 0.5,
          motion: "pulse",
          strobe_risk: "none",
        },
        parameters: [
          {
            id: "speed",
            name: "Speed",
            value_type: "scalar",
            default_value: { type: "scalar", value: 1 },
            range: [0.1, 4],
            unit: "multiplier",
            ui_hint: "slider",
            automation: "continuous",
          },
          {
            id: "direction",
            name: "Direction",
            value_type: "direction",
            default_value: { type: "direction", value: "forward" },
            unit: "direction",
            ui_hint: "segmented",
            automation: "discrete",
          },
        ],
        graph: { nodes: [] },
      },
    ],
    effect_instances: [
      {
        id: "front",
        definition_id: "pulse",
        definition_revision: 2,
        target_group_id: "front",
        seed: "0000000000000001",
        parameter_overrides: { speed: { type: "scalar", value: 2 } },
      },
    ],
    timeline: {
      ppq: 960,
      tempo_map: { points: [{ time_tick: 0, bpm: 120 }] },
      tracks: [
        {
          id: "automation",
          name: "Automation",
          overlap_policy: "layer",
          clips: [],
          automation_lanes: [
            {
              id: "direction-lane",
              target: {
                scope: "effect_instance",
                instance_id: "front",
                parameter_id: "direction",
              },
              keyframes: [
                {
                  id: "direction-start",
                  time_tick: 0,
                  value: { type: "direction", value: "forward" },
                  interpolation: "hold",
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

describe("automationParameterOptions", () => {
  it("resolves the exact definition revision, instance override, and unused targets", () => {
    const options = automationParameterOptions(documentFixture(), "phaser:front");

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      target: { scope: "effect_instance", instance_id: "front", parameter_id: "speed" },
      initialValue: { type: "scalar", value: 2 },
      definition: { unit: "multiplier", range: [0.1, 4] },
    });
  });

  it("exposes master dimmer only while its global target is unused", () => {
    const document = documentFixture();
    expect(automationParameterOptions(document, "global")).toHaveLength(1);
    document.timeline!.tracks[0].automation_lanes!.push({
      id: "master",
      target: { scope: "global", parameter_id: "master_dimmer" },
      keyframes: [
        {
          id: "master-start",
          time_tick: 0,
          value: { type: "scalar", value: 1 },
          interpolation: "linear",
        },
      ],
    });
    expect(automationParameterOptions(document, "global")).toHaveLength(0);
  });

  it("resolves metadata for an existing lane without filtering its target", () => {
    const document = documentFixture();
    const lane = document.timeline!.tracks[0].automation_lanes![0];

    expect(resolveAutomationParameter(document, lane.target)).toMatchObject({
      definition: {
        id: "direction",
        value_type: "direction",
        automation: "discrete",
      },
    });
  });
});
