import { describe, expect, it } from "vitest";
import { validateShowDocument } from "@/document/showDocument";
import { createStarterProject } from "../defaultProject";
import {
  createEffectPair,
  duplicateEffectPair,
  effectFormValues,
  effectIsUsed,
  reviseEffectPair,
} from "./effectFactory";

describe("Effect Lab models", () => {
  it("creates a deterministic smooth accent that validates against the current V1", () => {
    const document = createStarterProject();
    const pair = createEffectPair(document);
    const next = {
      ...document,
      effect_definitions: [pair.definition],
      effect_instances: [pair.instance],
    };

    expect(validateShowDocument(next).success).toBe(true);
    expect(pair.definition.name).toBe("Smooth Accent");
    expect(pair.definition.graph.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "shape-triangle" })]),
    );
    expect(pair.instance.seed).toMatch(/^[0-9a-f]{16}$/);
    expect(pair.instance.target_group_id).toBe("all-fixtures");
    expect(pair.instance.parameter_overrides?.color).toEqual({
      type: "color",
      value: "#ff2d55",
    });
  });

  it("round-trips controls into a new immutable definition revision", () => {
    const pair = createEffectPair(createStarterProject());
    const values = effectFormValues(pair.definition, pair.instance);
    const revised = reviseEffectPair(pair.definition, pair.instance, {
      ...values,
      name: "Blue Sine",
      waveform: "sine",
      speed: 2,
      phase: 0.25,
      color: "#0088ff",
    });

    expect(revised.definition.id).toBe(pair.definition.id);
    expect(revised.definition.revision).toBe(2);
    expect(revised.instance.definition_revision).toBe(2);
    expect(effectFormValues(revised.definition, revised.instance)).toMatchObject({
      name: "Blue Sine",
      waveform: "sine",
      speed: 2,
      phase: 0.25,
      color: "#0088ff",
    });
  });

  it("duplicates stable content with independent IDs and detects arrangement usage", () => {
    const document = createStarterProject();
    const pair = createEffectPair(document);
    document.effect_definitions.push(pair.definition);
    document.effect_instances.push(pair.instance);
    const duplicate = duplicateEffectPair(document, pair.definition, pair.instance);

    expect(duplicate.definition.id).not.toBe(pair.definition.id);
    expect(duplicate.instance.id).not.toBe(pair.instance.id);
    expect(duplicate.definition.name).toBe("Smooth Accent Copy");
    expect(effectIsUsed(document, pair.definition.id)).toBe(false);

    document.timeline!.tracks[0].clips!.push({
      id: "pulse-clip",
      instance_id: pair.instance.id,
      start_tick: 0,
      duration_tick: 960,
    });
    expect(effectIsUsed(document, pair.definition.id)).toBe(true);
  });
});
