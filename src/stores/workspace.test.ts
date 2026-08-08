import { beforeEach, describe, expect, it } from "vitest";
import {
  authoringSessionKey,
  authoringTransportActions,
  useAuthoringTransportStore,
} from "@/authoring/transport";
import { useWorkspaceStore, workspaceActions } from "./workspace";

describe("workspace state", () => {
  beforeEach(() => {
    localStorage.clear();
    authoringTransportActions.reset();
    workspaceActions.reset();
  });

  it("keeps the five Stage 7 workspaces separate from Advanced Mode", () => {
    workspaceActions.setAdvancedMode(true);
    workspaceActions.setActiveWorkspace("effect-lab");

    expect(useWorkspaceStore.getState()).toMatchObject({
      activeWorkspace: "effect-lab",
      advancedMode: false,
    });
  });

  it("pauses authoring playback when the user changes workspace", () => {
    const key = authoringSessionKey("effect", "pulse@1");
    authoringTransportActions.ensureSession({ key, scope: "effect", durationTicks: 3_840 });
    authoringTransportActions.play(key);

    workspaceActions.setActiveWorkspace("effect-lab");

    expect(useAuthoringTransportStore.getState().sessions[key].playback).toBe("paused");
  });

  it("resets a removed workspace from an older development cache", async () => {
    const migrate = useWorkspaceStore.persist.getOptions().migrate;

    expect(migrate).toBeDefined();
    const migrated = await Promise.resolve(migrate?.({ activeWorkspace: "arrange" }, 4));

    expect(migrated).toMatchObject({
      activeWorkspace: "stage",
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

  it("persists Live Pad behavior separately from high-frequency active state", () => {
    workspaceActions.setLivePadQuantize("bar");
    workspaceActions.setLivePadConfig("red-pulse", {
      mode: "one_shot",
      exclusiveGroup: "color",
      oneShotBeats: 8,
    });

    expect(useWorkspaceStore.getState()).toMatchObject({
      livePadQuantize: "bar",
      livePadConfigs: {
        "red-pulse": { mode: "one_shot", exclusiveGroup: "color", oneShotBeats: 8 },
      },
    });
  });
});
