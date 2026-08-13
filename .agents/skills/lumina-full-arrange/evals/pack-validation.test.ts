import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { importUserAssetPack, validateUserAssetPack } from "@/document/userAssetPack";

const packPath = process.env.LUMINA_PACK_PATH;

describe.runIf(Boolean(packPath))("lumina-full-arrange output pack", () => {
  it("passes the current pack and ProjectBundle semantic authorities", () => {
    const pack = JSON.parse(readFileSync(packPath!, "utf8")) as unknown;
    const validation = validateUserAssetPack(pack);

    expect(validation).toMatchObject({ success: true, issues: [] });
    expect(() => importUserAssetPack(createStarterProjectBundle(), pack, "rename")).not.toThrow();
  });
});
