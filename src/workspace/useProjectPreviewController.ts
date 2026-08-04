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
import type {
  ArrangementDocument,
  AssetRef,
  ProjectPreviewFrame,
  PreviewSource,
  RenderContext,
} from "@/bridge/types";
import { assetKey, exactAsset } from "@/document/projectModel";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import type { WorkspaceId } from "@/stores/workspace";

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
  const selectedArrangementRef = useProjectStore(projectSelectors.selectedArrangementRef);
  const selectedTargetSetId = useProjectStore(projectSelectors.selectedTargetSetId);
  const previewSourceMode = useProjectStore(projectSelectors.previewSource);
  const liveViewMode = useProjectStore(projectSelectors.liveViewMode);
  const publishedRevision = useProjectStore(projectSelectors.rehearsalPublishedRevision);
  const compiledKeyRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  const arrangement = exactAsset(bundle.arrangements, selectedArrangementRef);
  const previewActive = workspace !== "live" || liveViewMode === "rehearsal";
  const context = useMemo<RenderContext>(() => {
    if (workspace === "effect-lab" && selectedEffectRef) {
      return {
        type: "effect",
        effect_ref: selectedEffectRef,
        target_set_id: selectedTargetSetId,
      };
    }
    if (workspace === "cues" && selectedCueRef) {
      return { type: "cue", cue_ref: selectedCueRef };
    }
    if (workspace === "arrange" || workspace === "live") return { type: "arrangement" };
    return { type: "stage" };
  }, [selectedCueRef, selectedEffectRef, selectedTargetSetId, workspace]);
  const source = useMemo<PreviewSource>(
    () =>
      workspace !== "live"
        ? { type: "authoring_draft" }
        : previewSourceMode === "rehearsal_published" && publishedRevision !== null
          ? { type: "rehearsal_published", revision: publishedRevision }
          : { type: "rehearsal_draft" },
    [previewSourceMode, publishedRevision, workspace],
  );
  const activeAuthoring = useMemo<ActiveAuthoringSession | null>(() => {
    if (!arrangement) return null;
    if (workspace === "effect-lab" && selectedEffectRef) {
      return authoringDescriptor("effect", selectedEffectRef, arrangement);
    }
    if (workspace === "cues" && selectedCueRef) {
      return authoringDescriptor("cue", selectedCueRef, arrangement);
    }
    if (workspace === "arrange" || workspace === "live") {
      return authoringDescriptor("arrangement", selectedArrangementRef, arrangement);
    }
    return null;
  }, [arrangement, selectedArrangementRef, selectedCueRef, selectedEffectRef, workspace]);
  const serializedBundle = useMemo(() => JSON.stringify(bundle), [bundle]);
  const compileKey =
    source.type === "rehearsal_published"
      ? `published:${source.revision}:${assetKey(selectedArrangementRef)}`
      : `${source.type}:${assetKey(selectedArrangementRef)}:${serializedBundle}`;

  useEffect(() => {
    if (!activeAuthoring) return;
    authoringTransportActions.ensureSession({
      key: activeAuthoring.key,
      scope: activeAuthoring.scope,
      durationTicks:
        activeAuthoring.scope === "arrangement" ? activeAuthoring.arrangement.length_ticks : 3_840,
      clockSource: activeAuthoring.scope === "arrangement" ? "arrangement" : "local",
    });
  }, [activeAuthoring]);

  useEffect(() => {
    if (!previewActive) return;
    const request = ++requestRef.current;
    const playheadTick = activeAuthoring
      ? (useAuthoringTransportStore.getState().sessions[activeAuthoring.key]?.cursorTick ?? 0)
      : 0;
    const compile = compiledKeyRef.current !== compileKey;
    const promise = compile
      ? engine.previewProject({
          project: source.type === "rehearsal_published" ? undefined : bundle,
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
        projectActions.setPreviewResult(frame.generation);
      })
      .catch((error) => {
        if (request !== requestRef.current) return;
        compiledKeyRef.current = null;
        projectActions.setPreviewError(formatPreviewError(error));
      });
  }, [activeAuthoring, bundle, compileKey, context, previewActive, selectedArrangementRef, source]);

  useEffect(() => {
    if (!previewActive || !activeAuthoring) return;
    const { key, arrangement: activeArrangement } = activeAuthoring;
    let frameRequest = 0;
    let lastRenderedAt = 0;
    let renderPending = false;
    let queuedTick: number | null = null;
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
          if (now - lastRenderedAt >= 1_000 / 30) {
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
  window.dispatchEvent(new CustomEvent("engine:project-preview-frame", { detail: frame }));
}

function formatPreviewError(error: unknown) {
  if (Array.isArray(error)) {
    return error
      .map((item) => (typeof item?.message === "string" ? item.message : String(item)))
      .join(" · ");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
