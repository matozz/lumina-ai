import { describe, expect, it } from "vitest";
import { validateShowDocument } from "@/document/showDocument";
import { createStarterProject } from "./defaultProject";

describe("starter DJ project", () => {
  it("opens as a valid dense 8×10 RGB stage at 128 BPM", () => {
    const project = createStarterProject();
    const validation = validateShowDocument(project);

    expect(validation.success).toBe(true);
    expect(project.patch).toEqual([{ profile_id: "generic-rgb", id_range: [1, 80] }]);
    expect(project.layout.generator).toMatchObject({
      shape: "matrix",
      rows: 8,
      columns: 10,
      spacing: 22,
    });
    expect(project.groups[0].name).toBe("All fixtures");
    expect(project.timeline?.tracks[0].name).toBe("Lighting looks");
    expect(project.timeline?.tempo_map.points[0].bpm).toBe(128);
    expect(project.effect_definitions).toEqual([]);
  });
});
