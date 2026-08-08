import { beforeEach, describe, expect, it } from "vitest";
import { createEffectAsset } from "@/document/projectModel";
import { createStarterProjectBundle } from "@/workspace/defaultProjectBundle";
import { authoringDraftActions, useAuthoringDraftStore } from "./authoringDraft";

describe("session-local authoring drafts", () => {
  beforeEach(() => authoringDraftActions.reset());

  it("retains Last Known Good when a newer Effect candidate is rejected", () => {
    const effect = createEffectAsset(createStarterProjectBundle(), "Pulse");
    authoringDraftActions.beginEffect(effect);
    authoringDraftActions.updateEffect((draft) => {
      draft.name = "";
    });
    const generation = useAuthoringDraftStore.getState().effect!.generation;

    authoringDraftActions.rejectEffectValidation(generation, [
      {
        code: "CATALOG_PARAMETER_INVALID",
        severity: "error",
        path: "effect.name",
        message: "Name is required.",
        hint: "Enter a name.",
      },
    ]);

    const session = useAuthoringDraftStore.getState().effect!;
    expect(session.working.name).toBe("");
    expect(session.lastKnownGood.name).toBe("Pulse");
    expect(session.status).toBe("invalid");
  });

  it("ignores stale validation results", () => {
    const effect = createEffectAsset(createStarterProjectBundle(), "Pulse");
    authoringDraftActions.beginEffect(effect);
    authoringDraftActions.updateEffect((draft) => {
      draft.name = "First";
    });
    const staleGeneration = useAuthoringDraftStore.getState().effect!.generation;
    const stale = structuredClone(useAuthoringDraftStore.getState().effect!.working);
    authoringDraftActions.updateEffect((draft) => {
      draft.name = "Second";
    });

    authoringDraftActions.acceptEffectValidation(staleGeneration, stale);

    expect(useAuthoringDraftStore.getState().effect?.working.name).toBe("Second");
  });
});
