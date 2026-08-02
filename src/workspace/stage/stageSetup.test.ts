import { describe, expect, it } from "vitest";
import {
  buildLayout,
  channelFootprint,
  diagnosePatch,
  fixtureIdsBySpatialFilter,
  fixtureIdsForPatch,
  fixtureProfiles,
  uniqueGroupId,
} from "./stageSetup";

describe("Stage Setup model", () => {
  it("derives fixture capability footprints from the generated profile catalog", () => {
    expect(channelFootprint(fixtureProfiles.find((profile) => profile.id === "generic-rgb")!)).toBe(
      4,
    );
    expect(
      channelFootprint(fixtureProfiles.find((profile) => profile.id === "generic-moving-head")!),
    ).toBe(11);
  });

  it("reports DMX overflow and overlap before a patch is applied", () => {
    const patch = [
      { profile_id: "generic-rgb", id_range: [1, 4] as [number, number] },
      { profile_id: "generic-rgbw", id_range: [5, 8] as [number, number] },
    ];
    const overlap = diagnosePatch(patch, [
      { universe: 1, startChannel: 1 },
      { universe: 1, startChannel: 8 },
    ]);
    const overflow = diagnosePatch([patch[1]], [{ universe: 1, startChannel: 500 }]);

    expect(overlap.some((item) => item.message.includes("overlap"))).toBe(true);
    expect(overflow.some((item) => item.message.includes("channel 519"))).toBe(true);
    expect(
      diagnosePatch(
        [{ profile_id: "generic-rgb", id_range: [Number.NaN, 4] }],
        [{ universe: 1, startChannel: 1 }],
      ).some((item) => item.message.includes("fixture ID range")),
    ).toBe(true);
  });

  it("builds deterministic matrix, circle, formula, and custom layouts", () => {
    const ids = fixtureIdsForPatch([{ profile_id: "generic-rgb", id_range: [1, 16] }]);
    expect(buildLayout("matrix", ids, 4).generator).toMatchObject({ rows: 4, columns: 4 });
    expect(buildLayout("circle", ids, 4).generator).toMatchObject({ shape: "circle" });
    expect(buildLayout("formula", ids, 4).generator).toMatchObject({ shape: "formula" });
    expect(buildLayout("custom", ids, 4).generator).toMatchObject({
      shape: "custom",
      fixtures: expect.arrayContaining([{ id: 16, x: 192, y: 192 }]),
    });
  });

  it("creates stable unique group IDs", () => {
    expect(
      uniqueGroupId("Front Wash", [
        { id: "front-wash", name: "Front", fixtures: [1], sort_by: "none" },
      ]),
    ).toBe("front-wash-2");
  });

  it("creates groups from visible spatial halves of a layout", () => {
    const ids = Array.from({ length: 16 }, (_, index) => index + 1);
    const layout = buildLayout("matrix", ids, 4);

    expect(fixtureIdsBySpatialFilter(layout, ids, "left")).toEqual([1, 2, 5, 6, 9, 10, 13, 14]);
    expect(fixtureIdsBySpatialFilter(layout, ids, "bottom")).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });
});
