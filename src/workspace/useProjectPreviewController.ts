import { useEffect, useMemo, useRef } from "react";
import { engine } from "@/bridge/commands";
import type { ProjectPreviewFrame, PreviewSource, RenderContext } from "@/bridge/types";
import { assetKey, exactAsset } from "@/document/projectModel";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import type { WorkspaceId } from "@/stores/workspace";

export function useProjectPreviewController(workspace: WorkspaceId) {
  const bundle = useProjectStore(projectSelectors.bundle);
  const selectedEffectRef = useProjectStore(projectSelectors.selectedEffectRef);
  const selectedCueRef = useProjectStore(projectSelectors.selectedCueRef);
  const selectedArrangementRef = useProjectStore(projectSelectors.selectedArrangementRef);
  const selectedTargetSetId = useProjectStore(projectSelectors.selectedTargetSetId);
  const previewSourceMode = useProjectStore(projectSelectors.previewSource);
  const liveViewMode = useProjectStore(projectSelectors.liveViewMode);
  const publishedRevision = useProjectStore(projectSelectors.rehearsalPublishedRevision);
  const effectPlayback = useProjectStore(projectSelectors.effectPreviewPlayback);
  const cuePlayback = useProjectStore(projectSelectors.cuePreviewPlayback);
  const effectTick = useProjectStore(projectSelectors.effectPreviewTick);
  const cueTick = useProjectStore(projectSelectors.cuePreviewTick);
  const arrangementSessions = useProjectStore((state) => state.arrangementSessions);
  const compiledKeyRef = useRef<string | null>(null);
  const requestRef = useRef(0);

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
  const playheadTick =
    workspace === "effect-lab"
      ? effectTick
      : workspace === "cues"
        ? cueTick
        : workspace === "arrange" || workspace === "live"
          ? (arrangementSessions[assetKey(selectedArrangementRef)]?.playheadTick ?? 0)
          : 0;
  const source = useMemo<PreviewSource>(
    () =>
      workspace !== "live"
        ? { type: "authoring_draft" }
        : previewSourceMode === "rehearsal_published" && publishedRevision !== null
          ? { type: "rehearsal_published", revision: publishedRevision }
          : { type: "rehearsal_draft" },
    [previewSourceMode, publishedRevision, workspace],
  );
  const serializedBundle = useMemo(() => JSON.stringify(bundle), [bundle]);
  const compileKey =
    source.type === "rehearsal_published"
      ? `published:${source.revision}:${assetKey(selectedArrangementRef)}`
      : `${source.type}:${assetKey(selectedArrangementRef)}:${serializedBundle}`;

  useEffect(() => {
    if (!previewActive) return;
    const request = ++requestRef.current;
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
  }, [bundle, compileKey, context, playheadTick, previewActive, selectedArrangementRef, source]);

  useEffect(() => {
    const playing =
      (workspace === "effect-lab" && effectPlayback === "playing" && selectedEffectRef) ||
      (workspace === "cues" && cuePlayback === "playing" && selectedCueRef);
    if (!previewActive || !playing) return;
    const initialTick = workspace === "effect-lab" ? effectTick : cueTick;
    const cueLength = selectedCueRef
      ? exactAsset(bundle.cues, selectedCueRef)?.nominal_length_ticks
      : undefined;
    const loopLength = Math.max(1, workspace === "cues" ? (cueLength ?? 3_840) : 3_840);
    const bpm =
      exactAsset(bundle.arrangements, selectedArrangementRef)?.tempo_map.points[0]?.bpm ?? 120;
    const ticksPerMillisecond = (960 * bpm) / 60_000;
    const startedAt = performance.now();
    let lastRenderedAt = 0;
    let lastTick = initialTick;
    let frameRequest = 0;
    let renderPending = false;
    const animate = (now: number) => {
      lastTick = Math.floor((initialTick + (now - startedAt) * ticksPerMillisecond) % loopLength);
      if (now - lastRenderedAt >= 1000 / 30 && !renderPending) {
        lastRenderedAt = now;
        renderPending = true;
        void engine
          .renderProjectPreview(context, lastTick)
          .then(dispatchPreviewFrame)
          .catch(() => undefined)
          .finally(() => {
            renderPending = false;
          });
      }
      frameRequest = requestAnimationFrame(animate);
    };
    frameRequest = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frameRequest);
      if (workspace === "effect-lab") projectActions.setEffectPreviewTick(lastTick);
      else projectActions.setCuePreviewTick(lastTick);
    };
  }, [
    bundle.arrangements,
    bundle.cues,
    context,
    cuePlayback,
    effectPlayback,
    previewActive,
    selectedArrangementRef,
    selectedCueRef,
    selectedEffectRef,
    workspace,
  ]);
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
