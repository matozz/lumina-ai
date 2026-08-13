import { describe, expect, it } from "vitest";
// @ts-expect-error The Skill helper is executable ESM without a TypeScript declaration file.
import { deriveFormWindow } from "../scripts/derive-form-window.mjs";

describe("lumina-full-arrange EDM form model", () => {
  it("derives the generic House buildup-to-second-drop window without off-by-one errors", () => {
    const result = deriveFormWindow({ profile: "house", startBar: 33, ppq: 960 });

    expect(result).toMatchObject({
      basis: "profile_default",
      phrase_quantum_bars: 8,
      start_bar: 33,
      end_bar: 104,
      total_bars: 72,
      ticks_per_bar: 3_840,
      checks: {
        contiguous: true,
        exact_requested_window: null,
        pattern_cycles_divide_sections: true,
      },
    });
    expect(result.sections).toEqual([
      expect.objectContaining({
        id: "buildup_1",
        start_bar: 33,
        end_bar: 48,
        length_bars: 16,
        pattern_cycle_bars: 4,
        start_tick: 122_880,
        end_tick_exclusive: 184_320,
      }),
      expect.objectContaining({
        id: "drop_1",
        start_bar: 49,
        end_bar: 64,
        length_bars: 16,
        pattern_cycle_bars: 8,
      }),
      expect.objectContaining({
        id: "breakdown",
        start_bar: 65,
        end_bar: 80,
        length_bars: 16,
        pattern_cycle_bars: 8,
      }),
      expect.objectContaining({
        id: "buildup_2",
        start_bar: 81,
        end_bar: 88,
        length_bars: 8,
        pattern_cycle_bars: 4,
      }),
      expect.objectContaining({
        id: "drop_2",
        start_bar: 89,
        end_bar: 104,
        length_bars: 16,
        pattern_cycle_bars: 8,
        end_tick_exclusive: 399_360,
      }),
    ]);
  });

  it("fits an explicit House endpoint using only legal phrase candidates", () => {
    const result = deriveFormWindow({ profile: "house", startBar: 33, endBar: 96 });

    expect(result).toMatchObject({
      basis: "exact_user_window_fit",
      total_bars: 64,
      end_bar: 96,
      checks: { exact_requested_window: true, contiguous: true },
    });
    expect(result.sections.map((section: { length_bars: number }) => section.length_bars)).toEqual([
      16, 16, 8, 8, 16,
    ]);
  });

  it("derives a narrower second-buildup-to-second-drop window", () => {
    const result = deriveFormWindow({
      profile: "house",
      fromSection: "buildup_2",
      throughSection: "drop_2",
      startBar: 81,
    });

    expect(result).toMatchObject({
      from_section: "buildup_2",
      through_section: "drop_2",
      start_bar: 81,
      end_bar: 104,
      total_bars: 24,
    });
    expect(result.sections.map((section: { id: string }) => section.id)).toEqual([
      "buildup_2",
      "drop_2",
    ]);
  });

  it("rejects a window that cannot be expressed by the selected phrase model", () => {
    expect(() => deriveFormWindow({ profile: "house", startBar: 33, endBar: 90 })).toThrow(
      /No phrase-aligned form fits/,
    );
  });
});
