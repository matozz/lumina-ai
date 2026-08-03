import { describe, expect, it } from "vitest";
import { validateShowDocument } from "@/document/showDocument";
import { createStarterProject } from "./defaultProject";

describe("starter DJ project", () => {
  it("opens as a valid 4×4 RGB stage without requiring Raw DSL", () => {
    const project = createStarterProject();
    const validation = validateShowDocument(project);

    expect(validation.success).toBe(true);
    expect(project.patch).toEqual([{ profile_id: "generic-rgb", id_range: [1, 16] }]);
    expect(project.layout.generator).toMatchObject({ shape: "matrix", rows: 4, columns: 4 });
    expect(project.groups[0].name).toBe("All fixtures");
    expect(project.timeline?.tracks[0].name).toBe("Lighting looks");
    expect(project.effect_definitions).toEqual([]);
  });
});
