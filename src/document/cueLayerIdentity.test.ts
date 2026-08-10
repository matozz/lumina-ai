import { describe, expect, it } from "vitest";
import { createOpaqueCueLayerId, isOpaqueCueLayerId } from "@/document/cueLayerIdentity";

describe("Cue Layer identity", () => {
  it("creates a unique opaque base32 identity without business semantics", () => {
    let byte = 0;
    const fill = (bytes: Uint8Array) => {
      bytes.fill(byte);
      byte += 1;
    };

    const first = createOpaqueCueLayerId([], fill);
    const second = createOpaqueCueLayerId([first], fill);

    expect(first).toBe("layer_aaaaaaaaaaaaaaaa");
    expect(second).not.toBe(first);
    expect(isOpaqueCueLayerId(first)).toBe(true);
    expect(isOpaqueCueLayerId(second)).toBe(true);
    expect(second).not.toMatch(/corner|effect|target|left|right|pulse/i);
  });

  it("retries an occupied random identity", () => {
    let call = 0;
    const fill = (bytes: Uint8Array) => {
      bytes.fill(call === 0 ? 0 : 255);
      call += 1;
    };

    expect(createOpaqueCueLayerId(["layer_aaaaaaaaaaaaaaaa"], fill)).toBe("layer_7777777777777777");
    expect(call).toBe(2);
  });
});
