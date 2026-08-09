import { useCallback, useEffect, useRef } from "react";
import { AuthoringDiagnosticAlert } from "@/authoring/AuthoringDiagnosticAlert";
import { authoringDiagnostic } from "@/authoring/diagnostics";
import {
  authoringSessionKey,
  authoringTransportActions,
  useAuthoringTransportStore,
} from "@/authoring/transport";
import { activeStage, appendExactRef, assetKey, exactAsset } from "@/document/projectModel";
import { ticksToPixels } from "@/panel/timelineGeometry";
import { projectActions, projectSelectors, useProjectStore } from "@/stores/project";
import { productionCatalogSelectors, useProductionCatalogStore } from "@/stores/productionCatalog";
import { useWorkspaceStore, workspaceActions, workspaceSelectors } from "@/stores/workspace";
import { ArrangementClipInspector } from "./timeline/ArrangementClipInspector";
import { ArrangementMarquee } from "./timeline/ArrangementMarquee";
import {
  ArrangementGrid,
  ArrangementPlayhead,
  ArrangementRuler,
} from "./timeline/ArrangementRuler";
import { ArrangementTimelineToolbar } from "./timeline/ArrangementTimelineToolbar";
import { ArrangementTrackHeaders } from "./timeline/ArrangementTrackHeaders";
import { ArrangementTrackRows } from "./timeline/ArrangementTrackRows";
import { useArrangementEditorShortcuts } from "./timeline/useArrangementEditorShortcuts";
import { useArrangementTimelineEditing } from "./timeline/useArrangementTimelineEditing";
import { useArrangementTimelineViewport } from "./timeline/useArrangementTimelineViewport";
import {
  addAutomationLane,
  automationOptions,
  updateCueClip,
} from "./timeline/arrangementTimelineModel";
import {
  arrangementSelectionFromItems,
  arrangementSelectionItemKey,
} from "./timeline/arrangementSelection";

const HEADER_WIDTH = 192;

export function ArrangementTimeline() {
  const bundle = useProjectStore(projectSelectors.bundle);
  const reference = useProjectStore(projectSelectors.selectedArrangementRef);
  const selectedCueRef = useProjectStore(projectSelectors.selectedCueRef);
  const pendingBuiltInCue = useWorkspaceStore(workspaceSelectors.selectedArrangeBuiltInCue);
  const productionCatalog = useProductionCatalogStore(productionCatalogSelectors.catalog);
  const canUndo = useProjectStore(projectSelectors.canUndo);
  const canRedo = useProjectStore(projectSelectors.canRedo);
  const focusMode = useWorkspaceStore(workspaceSelectors.arrangeTimelineFocus);
  const arrangement = exactAsset(bundle.arrangements, reference);
  const stage = activeStage(bundle);
  const selectedBuiltInCue =
    pendingBuiltInCue && assetKey(pendingBuiltInCue.cue.compatible_stage_ref) === assetKey(stage)
      ? pendingBuiltInCue
      : null;
  const selectedCue = selectedBuiltInCue?.cue ?? exactAsset(bundle.cues, selectedCueRef);
  const snapGuideRef = useRef<HTMLDivElement>(null);
  const firstSignature = arrangement?.time_signatures[0] ?? {
    time_tick: 0,
    numerator: 4,
    denominator: 4,
  };
  const {
    beatWidth,
    fit,
    geometry,
    headersRef,
    scrollRef,
    setSnapPreset,
    snapPreset,
    trackPointer,
    updateViewport,
    viewport,
    zoomIn,
    zoomOut,
  } = useArrangementTimelineViewport(
    arrangement?.ppq ?? 960,
    arrangement?.length_ticks ?? 1,
    firstSignature,
  );
  const sessionKey = authoringSessionKey("arrangement", assetKey(reference));

  const playheadTick = useCallback(
    () => useAuthoringTransportStore.getState().sessions[sessionKey]?.cursorTick ?? 0,
    [sessionKey],
  );
  const handleZoomIn = useCallback(() => zoomIn(playheadTick()), [playheadTick, zoomIn]);
  const handleZoomOut = useCallback(() => zoomOut(playheadTick()), [playheadTick, zoomOut]);
  const {
    cancelGestureOrClearSelection,
    clearSelection,
    copySelection,
    deleteItems,
    diagnostic,
    duplicateItems,
    moveItems,
    pasteSelection,
    resizeItems,
    runCommand,
    selectAll,
    selectItem,
    selection,
    setDiagnostic,
    setGestureCancel,
    setSelection,
  } = useArrangementTimelineEditing({
    anchorTick: playheadTick,
    arrangement,
    reference,
    snapTicks: geometry.snapTicks,
  });

  useArrangementEditorShortcuts({
    hasSelection: selection.items.length > 0,
    sessionKey,
    snapTicks: geometry.snapTicks,
    ppq: arrangement?.ppq ?? 960,
    onClearSelection: clearSelection,
    onCopy: copySelection,
    onDelete: () => deleteItems(selection.items),
    onDuplicate: () => duplicateItems(selection.items),
    onEscape: cancelGestureOrClearSelection,
    onFit: fit,
    onMoveSelection: (deltaTick) => moveItems(selection.items, deltaTick),
    onPaste: pasteSelection,
    onRedo: projectActions.redo,
    onResizeSelection: (deltaTick) => resizeItems(selection.items, deltaTick),
    onSelectAll: selectAll,
    onUndo: projectActions.undo,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
  });

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

  const placeSelectedCue = () => {
    const cue = selectedCue;
    const cueRef = cue ? { id: cue.id, revision: cue.revision } : null;
    if (!cue || !cueRef) {
      setDiagnostic(
        authoringDiagnostic(
          new Error("The selected Cue is no longer available."),
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
            appendExactRef(workingBundle.manifest.effect_refs, {
              id: effect.id,
              revision: effect.revision,
            });
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
        setSelection(
          arrangementSelectionFromItems([{ type: "clip", trackId: track.id, clipId: id }]),
        );
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
    scrollRef.current?.clientWidth ?? 0,
    ticksToPixels(arrangement.length_ticks, geometry),
  );
  const primaryItem = selection.items.find(
    (item) => arrangementSelectionItemKey(item) === selection.primary,
  );
  const selected =
    primaryItem?.type === "clip"
      ? (arrangement.tracks
          .find((track) => track.id === primaryItem.trackId)
          ?.clips?.find((clip) => clip.id === primaryItem.clipId) ?? null)
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
    >
      <ArrangementTimelineToolbar
        beatWidth={beatWidth}
        bundle={bundle}
        canRedo={canRedo}
        canUndo={canUndo}
        focusMode={focusMode}
        onCreate={() => projectActions.createArrangement()}
        onDuplicate={() => projectActions.duplicateArrangement(reference)}
        onPlaceCue={placeSelectedCue}
        onRedo={projectActions.redo}
        onSelectArrangement={(next) => {
          clearSelection();
          setDiagnostic(null);
          projectActions.selectArrangement(next);
        }}
        onUndo={projectActions.undo}
        onFit={fit}
        onSnapChange={setSnapPreset}
        onToggleFocus={() => workspaceActions.setArrangeTimelineFocus(!focusMode)}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        reference={reference}
        selectedCueName={selectedCue?.name ?? null}
        snapPreset={snapPreset}
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
            onPointerMove={(event) => trackPointer(event.clientX)}
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
                <ArrangementMarquee
                  arrangement={arrangement}
                  bundle={bundle}
                  geometry={geometry}
                  selection={selection}
                  viewportRef={scrollRef}
                  onCancelReady={(cancel) => {
                    setGestureCancel(cancel);
                  }}
                  onSelectionChange={setSelection}
                >
                  <ArrangementTrackRows
                    arrangement={arrangement}
                    bundle={bundle}
                    geometry={geometry}
                    onCancelReady={setGestureCancel}
                    runCommand={runCommand}
                    selection={selection}
                    viewport={viewport}
                    viewportRef={scrollRef}
                    onMoveItems={moveItems}
                    onResizeItems={resizeItems}
                    onSelectItem={(item, modifiers) => {
                      selectItem(item, modifiers);
                      setDiagnostic(null);
                    }}
                    onSnapPreview={updateSnapPreview}
                  />
                </ArrangementMarquee>
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
            clearSelection();
            setDiagnostic(null);
          }}
          onUpdate={(changes) =>
            selected &&
            runCommand("Edit CueClip", `arrangement.clip.${selected.id}.inspector`, (draft) =>
              updateCueClip(draft, selected.id, changes),
            )
          }
          onDelete={() => selected && deleteItems(selection.items)}
          onDuplicate={() => selected && duplicateItems(selection.items)}
        />
      </div>
    </section>
  );
}
