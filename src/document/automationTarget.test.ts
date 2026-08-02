import { describe, expect, it } from "vitest";
import { automationTargetParentTrack, automationTargetPath } from "./automationTarget";

describe("structured automation target helpers", () => {
  it("maps typed targets to stable runtime and timeline keys", () => {
    const target = {
      scope: "effect_instance" as const,
      instance_id: "pulse",
      parameter_id: "color" as const,
    };

    expect(automationTargetPath(target)).toBe("phaser:pulse.color");
    expect(automationTargetParentTrack(target)).toBe("phaser:pulse");
    expect(automationTargetPath({ scope: "global", parameter_id: "master_dimmer" })).toBe(
      "global.master_dimmer",
    );
  });
});
