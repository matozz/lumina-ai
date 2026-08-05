import { useEffect, useRef, useState } from "react";
import type { ArrangementDocument, ProjectBundle } from "@/bridge/types";
import { AuthoringDiagnosticAlert } from "@/authoring/AuthoringDiagnosticAlert";
import { authoringDiagnostic, type AuthoringDiagnostic } from "@/authoring/diagnostics";
import {
  authoringSessionKey,
  authoringTransportActions,
  useAuthoringTransportStore,
} from "@/authoring/transport";
import { activeStage, appendExactRef, assetKey, exactAsset } from "@/document/projectModel";
import { isTextEditingTarget } from "@/lib/dom";
import { BEAT_WIDTH_STEP, ticksToPixels } from "@/panel/timelineGeometry";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { productionCatalogSelectors, useProductionCatalogStore } from "@/stores/productionCatalog";
import { useWorkspaceStore, workspaceActions, workspaceSelectors } from "@/stores/workspace";
import { ArrangementClipInspector } from "./timeline/ArrangementClipInspector";
import {
  ArrangementGrid,
  ArrangementPlayhead,
  ArrangementRuler,
} from "./timeline/ArrangementRuler";
import { ArrangementTimelineToolbar } from "./timeline/ArrangementTimelineToolbar";
import { ArrangementTrackHeaders } from "./timeline/ArrangementTrackHeaders";
import { ArrangementTrackRows } from "./timeline/ArrangementTrackRows";
import { useArrangementTimelineViewport } from "./timeline/useArrangementTimelineViewport";
import {
  addAutomationLane,
  automationOptions,
  deleteCueClip,
  duplicateCueClip,
  updateCueClip,
} from "./timeline/arrangementTimelineModel";

const HEADER_WIDTH = 192;

export function ArrangementTimeline() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const reference = useProjectStore(projectSelectors.selectedArrangementRef);
  const selectedCueRef = useProjectStore(projectSelectors.selectedCueRef);
  const pendingBuiltInCue = useWorkspaceStore(workspaceSelectors.selectedArrangeBuiltInCue);
  const productionCatalog = useProductionCatalogStore(productionCatalogSelectors.catalog);
  const canUndo = useProjectStore(projectSelectors.canUndo);
  const canRedo = useProjectStore(projectSelectors.canRedo);
  const arrangement = exactAsset(bundle.arrangements, reference);
  const stage = activeStage(bundle);
  const selectedBuiltInCue =
    pendingBuiltInCue && assetKey(pendingBuiltInCue.cue.compatible_stage_ref) === assetKey(stage)
      ? pendingBuiltInCue
      : null;
  const selectedCue = selectedBuiltInCue?.cue ?? exactAsset(bundle.cues, selectedCueRef);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<AuthoringDiagnostic | null>(null);
  const snapGuideRef = useRef<HTMLDivElement>(null);
  const { beatWidth, geometry, headersRef, scrollRef, updateViewport, viewport, zoom } =
    useArrangementTimelineViewport(arrangement?.ppq ?? 960);
  const sessionKey = authoringSessionKey("arrangement", assetKey(reference));

  useEffect(() => {
    if (!arrangement) return;
    authoringTransportActions.ensureSession({
      key: sessionKey,
      scope: "arrangement",
      durationTicks: arrangement.length_ticks,
      clockSource: "arrangement",
    });
  }, [arrangement, sessionKey]);

  if (!arrangement) return null;

  const runCommand = (
    label: string,
    path: string,
    update: (draft: ArrangementDocument, bundle: ProjectBundle) => void,
  ) => {
    try {
      projectActions.updateArrangement(reference, label, update);
      setDiagnostic(null);
      return true;
    } catch (error) {
      setDiagnostic(authoringDiagnostic(error, path));
      return false;
    }
  };

  const placeSelectedCue = () => {
    const cue = selectedCue;
    const cueRef = cue ? { id: cue.id, revision: cue.revision } : null;
    if (!cue || !cueRef) {
      setDiagnostic(
        authoringDiagnostic(
          new Error("The selected pinned Cue revision is missing."),
          "arrangement.toolbar.place_cue",
        ),
      );
      return;
    }
    const durationTick = Math.min(arrangement.length_ticks, cue.nominal_length_ticks);
    const cursorTick = useAuthoringTransportStore.getState().sessions[sessionKey]?.cursorTick ?? 0;
    const startTick = Math.min(arrangement.length_ticks - durationTick, cursorTick);
    const placed = runCommand(
      `Place Cue ${cue.name}`,
      "arrangement.toolbar.place_cue",
      (draft, workingBundle) => {
        if (selectedBuiltInCue) {
          for (const layer of cue.layers) {
            const effect = exactAsset(productionCatalog?.effects ?? [], layer.effect_ref);
            if (!effect) {
              throw new Error(`Built-in Effect ${assetKey(layer.effect_ref)} is unavailable.`);
            }
            if (!exactAsset(workingBundle.effects, effect)) {
              workingBundle.effects.push(structuredClone(effect));
            }
            appendExactRef(workingBundle.manifest.effect_refs, effect);
          }
          if (!exactAsset(workingBundle.cues, cueRef)) {
            workingBundle.cues.push(structuredClone(cue));
          }
          appendExactRef(workingBundle.manifest.cue_refs, cueRef);
        }
        const track = draft.tracks[0];
        track.clips ??= [];
        const existing = new Set(
          draft.tracks.flatMap((item) => item.clips?.map((clip) => clip.id) ?? []),
        );
        let id = `${cue.id}-clip`;
        let suffix = 2;
        while (existing.has(id)) id = `${cue.id}-clip-${suffix++}`;
        track.clips.push({
          id,
          cue_ref: { ...cueRef },
          start_tick: startTick,
          duration_tick: durationTick,
          source_offset_tick: 0,
          playback: "loop",
          layer: 0,
          layer_overrides: [],
        });
        setSelectedClipId(id);
      },
    );
    if (placed) {
      workspaceActions.setPublishStatus("idle", `${cue.name} placed at the playhead.`);
    }
  };

  const updateSnapPreview = (tick: number | null) => {
    const guide = snapGuideRef.current;
    if (!guide) return;
    if (tick === null) {
      guide.style.display = "none";
      return;
    }
    guide.style.display = "block";
    guide.style.transform = `translateX(${ticksToPixels(tick, geometry)}px)`;
    const label = guide.querySelector<HTMLElement>("[data-snap-label]");
    if (label) label.textContent = `${tick} t`;
  };

  const laneOptions = automationOptions(bundle, arrangement);
  const contentWidth = Math.max(
    900,
    ticksToPixels(arrangement.length_ticks + arrangement.ppq * 2, geometry),
  );
  const selected = selectedClipId
    ? (arrangement.tracks
        .flatMap((track) => track.clips ?? [])
        .find((clip) => clip.id === selectedClipId) ?? null)
    : null;
  const selectedCueName = selected
    ? (exactAsset(bundle.cues, selected.cue_ref)?.name ?? selected.cue_ref.id)
    : null;
  const clipDiagnostic = diagnostic?.path.startsWith("arrangement.clip") ? diagnostic : null;

  return (
    <section
      className="bg-card flex h-full min-h-0 flex-col"
      aria-label="Arrangement timeline"
      tabIndex={0}
      onKeyDown={(event) => {
        if (isTextEditingTarget(event.target) || (!event.metaKey && !event.ctrlKey)) return;
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) projectActions.redo();
          else projectActions.undo();
        } else if (key === "y") {
          event.preventDefault();
          projectActions.redo();
        }
      }}
    >
      <ArrangementTimelineToolbar
        arrangement={arrangement}
        beatWidth={beatWidth}
        bundle={bundle}
        canRedo={canRedo}
        canUndo={canUndo}
        geometry={geometry}
        onCreate={() => projectActions.createArrangement()}
        onDuplicate={() => projectActions.duplicateArrangement(reference)}
        onPlaceCue={placeSelectedCue}
        onRedo={projectActions.redo}
        onSelectArrangement={(next) => {
          setSelectedClipId(null);
          setDiagnostic(null);
          projectActions.selectArrangement(next);
        }}
        onUndo={projectActions.undo}
        onZoomIn={() => zoom(beatWidth + BEAT_WIDTH_STEP)}
        onZoomOut={() => zoom(beatWidth - BEAT_WIDTH_STEP)}
        reference={reference}
        selectedCueName={selectedCue?.name ?? null}
      />
      {diagnostic && !clipDiagnostic && (
        <AuthoringDiagnosticAlert
          diagnostic={diagnostic}
          recoveryLabel="Dismiss and retry"
          onRecover={() => setDiagnostic(null)}
        />
      )}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1">
          <ArrangementTrackHeaders
            arrangement={arrangement}
            bundle={bundle}
            headersRef={headersRef}
            options={laneOptions}
            width={HEADER_WIDTH}
            onAddAutomation={(trackId, option) =>
              runCommand(
                "Add Arrangement automation lane",
                `arrangement.track.${trackId}.automation`,
                (draft) =>
                  addAutomationLane(
                    draft,
                    trackId,
                    option,
                    useAuthoringTransportStore.getState().sessions[sessionKey]?.cursorTick ?? 0,
                  ),
              )
            }
          />
          <div
            ref={scrollRef}
            data-arrangement-timeline-scroll
            className="bg-background relative min-w-0 flex-1 overflow-auto overscroll-none"
            onScroll={(event) => {
              updateViewport(event.currentTarget);
              if (headersRef.current) headersRef.current.scrollTop = event.currentTarget.scrollTop;
            }}
          >
            <div className="relative min-h-full" style={{ width: contentWidth }}>
              <ArrangementRuler
                arrangement={arrangement}
                geometry={geometry}
                sessionKey={sessionKey}
                viewport={viewport}
              />
              <div className="relative">
                <ArrangementGrid
                  arrangement={arrangement}
                  geometry={geometry}
                  viewport={viewport}
                />
                <ArrangementTrackRows
                  arrangement={arrangement}
                  bundle={bundle}
                  geometry={geometry}
                  runCommand={runCommand}
                  selectedClipId={selectedClipId}
                  viewport={viewport}
                  viewportRef={scrollRef}
                  onSnapPreview={updateSnapPreview}
                  onSelectClip={(id) => {
                    setSelectedClipId(id);
                    setDiagnostic(null);
                  }}
                />
              </div>
              <div
                ref={snapGuideRef}
                className="bg-primary pointer-events-none absolute inset-y-0 left-0 z-50 hidden w-px will-change-transform"
                aria-hidden="true"
              >
                <span
                  data-snap-label
                  className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1 font-mono text-[9px] whitespace-nowrap"
                />
              </div>
              <ArrangementPlayhead geometry={geometry} sessionKey={sessionKey} />
            </div>
          </div>
        </div>
        <ArrangementClipInspector
          arrangementLength={arrangement.length_ticks}
          clip={selected}
          cueName={selectedCueName}
          diagnostic={clipDiagnostic}
          onRecover={() => {
            setSelectedClipId(null);
            setDiagnostic(null);
          }}
          onUpdate={(changes) =>
            selected &&
            runCommand("Edit CueClip", `arrangement.clip.${selected.id}.inspector`, (draft) =>
              updateCueClip(draft, selected.id, changes),
            )
          }
          onDelete={() =>
            selected &&
            runCommand("Delete CueClip", `arrangement.clip.${selected.id}.delete`, (draft) => {
              deleteCueClip(draft, selected.id);
              setSelectedClipId(null);
            })
          }
          onDuplicate={() =>
            selected &&
            runCommand(
              "Duplicate CueClip",
              `arrangement.clip.${selected.id}.duplicate`,
              (draft) => {
                const id = duplicateCueClip(draft, selected.id, geometry.snapTicks);
                setSelectedClipId(id);
              },
            )
          }
        />
      </div>
    </section>
  );
}
