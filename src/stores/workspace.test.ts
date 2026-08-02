import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceStore, workspaceActions } from "./workspace";

describe("workspace state", () => {
  beforeEach(() => {
    localStorage.clear();
    workspaceActions.reset();
  });

  it("keeps five product workspaces separate from Advanced Mode", () => {
    workspaceActions.setAdvancedMode(true);
    workspaceActions.setActiveWorkspace("effect-lab");

    expect(useWorkspaceStore.getState()).toMatchObject({
      activeWorkspace: "effect-lab",
      advancedMode: false,
    });
  });

  it("tracks favorites without duplicating effect IDs", () => {
    workspaceActions.toggleFavoriteEffect("red-pulse");
    workspaceActions.toggleFavoriteEffect("red-pulse");
    workspaceActions.toggleFavoriteEffect("red-pulse");

    expect(useWorkspaceStore.getState().favoriteEffectIds).toEqual(["red-pulse"]);
  });

  it("distinguishes the latest published revision from the Live Snapshot", () => {
    workspaceActions.setSnapshotState({ published_revision: 3, live_revision: 2 });
    workspaceActions.setPublishStatus("publishing", "Publishing validated revision…");

    expect(useWorkspaceStore.getState()).toMatchObject({
      publishedRevision: 3,
      liveRevision: 2,
      publishStatus: "publishing",
    });
  });

  it("persists user-authored fixture protocol addresses outside high-frequency engine state", () => {
    workspaceActions.setPatchAddress(0, { universe: 2, startChannel: 101 });

    expect(useWorkspaceStore.getState().patchAddresses[0]).toEqual({
      universe: 2,
      startChannel: 101,
    });
  });
});
