import { useEffect, useMemo, useRef } from "react";
import { advanceClockTick } from "@/authoring/musicalTime";
import { clockForSession } from "@/authoring/clockDefinition";
import {
  authoringSessionKey,
  authoringTransportActions,
  useAuthoringTransportStore,
  type AuthoringScope,
} from "@/authoring/transport";
import { engine } from "@/bridge/commands";
import { publishLayoutPreview, publishProjectPreview } from "@/canvas/previewBus";
import type {
  ArrangementDocument,
  AssetRef,
  ProjectPreviewFrame,
  PreviewSource,
  RenderContext,
} from "@/bridge/types";
import { activeLayout, activeStage, assetKey, exactAsset } from "@/document/projectModel";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { authoringDraftSelectors, useAuthoringDraftStore } from "@/stores/authoringDraft";
import { productionCatalogSelectors, useProductionCatalogStore } from "@/stores/productionCatalog";
import type { WorkspaceId } from "@/stores/workspace";
import { useWorkspaceStore, workspaceSelectors } from "@/stores/workspace";
import { materializeAuthoringPreview } from "./authoringPreviewBundle";

interface ActiveAuthoringSession {
  key: string;
  scope: AuthoringScope;
  reference: AssetRef;
  arrangement: ArrangementDocument;
}

export function useProjectPreviewController(workspace: WorkspaceId) {
  const bundle = useProjectStore(projectSelectors.bundle);
  const selectedEffectRef = useProjectStore(projectSelectors.selectedEffectRef);
  const selectedCueRef = useProjectStore(projectSelectors.selectedCueRef);
  const selectedLayoutRef = useProjectStore(projectSelectors.selectedLayoutRef);
  const selectedArrangementRef = useProjectStore(projectSelectors.selectedArrangementRef);
  const selectedTargetSetId = useProjectStore(projectSelectors.selectedTargetSetId);
  const previewSourceMode = useProjectStore(projectSelectors.previewSource);
  const liveViewMode = useProjectStore(projectSelectors.liveViewMode);
  const publishedRevision = useProjectStore(projectSelectors.rehearsalPublishedRevision);
  const effectDraft = useAuthoringDraftStore(authoringDraftSelectors.effect);
  const cueDraft = useAuthoringDraftStore(authoringDraftSelectors.cue);
  const comparison = useAuthoringDraftStore(authoringDraftSelectors.comparison);
  const productionCatalog = useProductionCatalogStore(productionCatalogSelectors.catalog);
  const inspectorVisible = useWorkspaceStore(workspaceSelectors.inspectorVisible);
  const compiledKeyRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const stageRequestRef = useRef(0);
  const previousAuthoringRef = useRef<ActiveAuthoringSession | null>(null);

  const materialized = useMemo(
    () =>
      materializeAuthoringPreview(
        bundle,
        selectedEffectRef,
        selectedCueRef,
        { effect: effectDraft, cue: cueDraft, comparison },
        productionCatalog,
        workspace === "effect-lab" || workspace === "cues"
          ? {
              scope: workspace === "effect-lab" ? "effect" : "cue",
              arrangementRef: selectedArrangementRef,
            }
          : {},
      ),
    [
      bundle,
      comparison,
      cueDraft,
      effectDraft,
      productionCatalog,
      selectedCueRef,
      selectedEffectRef,
      selectedArrangementRef,
      workspace,
    ],
  );
  const previewBundle = materialized.bundle;
  const previewEffectRef = materialized.effectRef;
  const previewCueRef = materialized.cueRef;
  const arrangement = exactAsset(previewBundle.arrangements, selectedArrangementRef);
  const previewActive =
    workspace !== "stage" && (workspace !== "live" || liveViewMode === "rehearsal");
  const context = useMemo<RenderContext>(() => {
    if (workspace === "effect-lab" && previewEffectRef) {
      return {
        type: "effect",
        effect_ref: previewEffectRef,
        target_set_id: selectedTargetSetId,
      };
    }
    if (workspace === "cues" && previewCueRef) {
      return { type: "cue", cue_ref: previewCueRef };
    }
    if (workspace === "arrange" || workspace === "live") return { type: "arrangement" };
    return { type: "stage" };
  }, [previewCueRef, previewEffectRef, selectedTargetSetId, workspace]);
  const source = useMemo<PreviewSource>(
    () =>
      workspace !== "live"
        ? { type: "authoring_draft" }
        : previewSourceMode === "rehearsal_published" && publishedRevision !== null
          ? { type: "rehearsal_published", revision: publishedRevision }
          : { type: "rehearsal_draft" },
    [previewSourceMode, publishedRevision, workspace],
  );
  const selectedLayout = exactAsset(bundle.layouts, selectedLayoutRef) ?? activeLayout(bundle);
  const stage = activeStage(bundle);
  const activeAuthoring = useMemo<ActiveAuthoringSession | null>(() => {
    if (!arrangement) return null;
    if (workspace === "effect-lab" && previewEffectRef) {
      return authoringDescriptor("effect", previewEffectRef, arrangement);
    }
    if (workspace === "cues" && previewCueRef) {
      return authoringDescriptor("cue", previewCueRef, arrangement);
    }
    if (workspace === "arrange" || workspace === "live") {
      return authoringDescriptor("arrangement", selectedArrangementRef, arrangement);
    }
    return null;
  }, [arrangement, previewCueRef, previewEffectRef, selectedArrangementRef, workspace]);
  const serializedBundle = useMemo(() => JSON.stringify(previewBundle), [previewBundle]);
  const compileKey =
    source.type === "rehearsal_published"
      ? `published:${source.revision}:${assetKey(selectedArrangementRef)}`
      : `${source.type}:${assetKey(selectedArrangementRef)}:${serializedBundle}`;

  useEffect(() => {
    if (workspace !== "stage" || inspectorVisible) return;
    const request = ++stageRequestRef.current;
    void engine
      .previewLayout(selectedLayout, stage)
      .then((coords) => {
        if (request !== stageRequestRef.current) return;
        publishLayoutPreview(coords);
      })
      .catch((error) => {
        if (request !== stageRequestRef.current) return;
        projectActions.setPreviewError(formatPreviewError(error));
      });
    return () => {
      stageRequestRef.current += 1;
    };
  }, [inspectorVisible, selectedLayout, stage, workspace]);

  useEffect(() => {
    const previous = previousAuthoringRef.current;
    if (!activeAuthoring) {
      previousAuthoringRef.current = null;
      return;
    }
    const defaults = {
      key: activeAuthoring.key,
      scope: activeAuthoring.scope,
      durationTicks:
        activeAuthoring.scope === "arrangement" ? activeAuthoring.arrangement.length_ticks : 3_840,
      clockSource: activeAuthoring.scope === "arrangement" ? "arrangement" : "local",
    } as const;
    if (
      previous &&
      previous.scope === activeAuthoring.scope &&
      previous.key !== activeAuthoring.key &&
      (workspace === "effect-lab" || workspace === "cues")
    ) {
      authoringTransportActions.continuePlayback(previous.key, defaults);
    } else {
      authoringTransportActions.ensureSession(defaults);
    }
    previousAuthoringRef.current = activeAuthoring;
  }, [activeAuthoring, workspace]);

  useEffect(() => {
    if (!previewActive) return;
    const request = ++requestRef.current;
    const playheadTick = activeAuthoring
      ? (useAuthoringTransportStore.getState().sessions[activeAuthoring.key]?.cursorTick ?? 0)
      : 0;
    const compile = compiledKeyRef.current !== compileKey;
    const promise = compile
      ? engine.previewProject({
          project: source.type === "rehearsal_published" ? undefined : previewBundle,
          arrangementRef:
            source.type === "rehearsal_published" ? undefined : selectedArrangementRef,
          source,
          context,
          playheadTick,
        })
      : engine.renderProjectPreview(context, playheadTick);
    void promise
      .then((frame) => {
        if (request !== requestRef.current) return;
        compiledKeyRef.current = compileKey;
        dispatchPreviewFrame(frame);
      })
      .catch((error) => {
        if (request !== requestRef.current) return;
        compiledKeyRef.current = null;
        projectActions.setPreviewError(formatPreviewError(error));
      });
  }, [
    activeAuthoring,
    compileKey,
    context,
    previewActive,
    previewBundle,
    selectedArrangementRef,
    source,
  ]);

  useEffect(() => {
    if (!previewActive || !activeAuthoring) return;
    const { key, arrangement: activeArrangement } = activeAuthoring;
    let frameRequest = 0;
    let lastRenderedAt = 0;
    let renderPending = false;
    let queuedTick: number | null = null;
    const previewFrameRate = activeAuthoring.scope === "effect" ? 60 : 30;
    let commandRevision = useAuthoringTransportStore.getState().sessions[key]?.commandRevision ?? 0;

    const renderTick = (tick: number) => {
      if (compiledKeyRef.current !== compileKey) return;
      queuedTick = tick;
      if (renderPending) return;
      const nextTick = queuedTick;
      queuedTick = null;
      renderPending = true;
      void engine
        .renderProjectPreview(context, nextTick)
        .then(dispatchPreviewFrame)
        .catch((error) => projectActions.setPreviewError(formatPreviewError(error)))
        .finally(() => {
          renderPending = false;
          if (queuedTick !== null) renderTick(queuedTick);
        });
    };

    const unsubscribe = useAuthoringTransportStore.subscribe((state) => {
      const session = state.sessions[key];
      if (!session || session.commandRevision === commandRevision) return;
      commandRevision = session.commandRevision;
      renderTick(session.cursorTick);
    });

    const animate = (now: number) => {
      const session = useAuthoringTransportStore.getState().sessions[key];
      if (session) {
        const clock = clockForSession(session, activeArrangement);
        if (session.durationTicks !== clock.durationTicks) {
          authoringTransportActions.configureDuration(key, clock.durationTicks, now);
        } else if (session.playback === "playing") {
          const next = advanceClockTick(session.anchorTick, now - session.anchorTimeMs, clock, {
            enabled: session.loopEnabled,
            startTick: session.loopStartTick,
            endTick: session.loopEndTick,
          });
          if (next.tick !== session.cursorTick || next.ended) {
            authoringTransportActions.publishCursor(key, next.tick, next.ended);
          }
          if (now - lastRenderedAt >= 1_000 / previewFrameRate) {
            lastRenderedAt = now;
            renderTick(next.tick);
          }
        }
      }
      frameRequest = requestAnimationFrame(animate);
    };

    frameRequest = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frameRequest);
      unsubscribe();
    };
  }, [activeAuthoring, compileKey, context, previewActive]);
}

function authoringDescriptor(
  scope: AuthoringScope,
  reference: AssetRef,
  arrangement: ArrangementDocument,
): ActiveAuthoringSession {
  return {
    key: authoringSessionKey(scope, assetKey(reference)),
    scope,
    reference,
    arrangement,
  };
}

function dispatchPreviewFrame(frame: ProjectPreviewFrame) {
  publishProjectPreview(frame);
  projectActions.setPreviewResult(frame);
}

export function formatPreviewError(error: unknown) {
  if (Array.isArray(error)) {
    const messages = error.map((item) =>
      typeof item?.message === "string" ? item.message : String(item),
    );
    return [...new Set(messages)].map(friendlyPreviewMessage).join(" · ");
  }
  if (error instanceof Error) return friendlyPreviewMessage(error.message);
  return friendlyPreviewMessage(String(error));
}

function friendlyPreviewMessage(message: string) {
  if (message.includes("Speed override must be a beat-synchronized multiplier")) {
    return "Choose a synced speed: ¼×, ½×, 1×, 2×, 4×, or 8×.";
  }
  if (message.includes("CUE_LAYER_ATTRIBUTE_CONFLICT")) {
    return "These effects control the same lights in conflicting ways. Remove one effect or open Advanced to choose how they mix.";
  }
  return message;
}
