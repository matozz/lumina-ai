import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CueDraftSession } from "@/stores/authoringDraft";
import { createCueAsset, createEffectAsset } from "@/document/projectModel";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { CueLayerList } from "./CueLayerList";

describe("CueLayerList", () => {
  it("never exposes a raw Layer identity when an Effect reference is missing", () => {
    const bundle = createStarterProjectBundle();
    const effect = createEffectAsset(bundle, "Ghost Effect");
    bundle.effects.push(effect);
    const cue = createCueAsset(bundle, [effect]);
    const rawLayerId = cue.layers[0].id;
    const session: CueDraftSession = {
      mode: "edit",
      pinned: cue,
      working: cue,
      lastKnownGood: cue,
      diagnostics: [],
      status: "pristine",
      generation: 0,
      selectedLayerId: rawLayerId,
      mutedLayerIds: [],
      soloLayerId: null,
    };

    render(
      <CueLayerList
        cue={cue}
        effects={[]}
        session={session}
        onSelect={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        advanced
      />,
    );

    expect(screen.getByText("Missing Effect · Layer 1")).toBeTruthy();
    expect(screen.queryByText(rawLayerId)).toBeNull();
    expect(document.body.textContent).not.toContain(rawLayerId);
    expect(
      [...document.querySelectorAll("[aria-label], [title]")].some((element) =>
        `${element.getAttribute("aria-label")} ${element.getAttribute("title")}`.includes(
          rawLayerId,
        ),
      ),
    ).toBe(false);
  });
});
