import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParameterDefinitionDSL } from "@/bridge/types";
import { createTimelineGeometry } from "@/panel/timelineGeometry";
import { ArrangementAutomationLane } from "./ArrangementAutomationLane";
import { arrangementSelectionFromItems } from "./arrangementSelection";
import { createHouseArrangementReference } from "./houseArrangementReference";

const definition: ParameterDefinitionDSL = {
  id: "intensity",
  name: "Intensity",
  value_type: "scalar",
  default_value: { type: "scalar", value: 0.5 },
  range: [0, 1],
  unit: "normalized",
  ui_hint: "slider",
  automation: "continuous",
};

describe("ArrangementAutomationLane pointer projection", () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("previews point and curve in one rAF projection and commits once at pointerup", () => {
    const arrangement = createHouseArrangementReference();
    const lane = arrangement.tracks[0].automation_lanes?.find(
      (candidate) => candidate.id === "rain-rise-intensity",
    )!;
    lane.keyframes = [
      {
        id: "point-a",
        time_tick: 960,
        value: { type: "scalar", value: 0.2 },
        interpolation: "linear",
      },
      {
        id: "point-b",
        time_tick: 1_920,
        value: { type: "scalar", value: 0.8 },
        interpolation: "linear",
      },
    ];
    const item = {
      type: "keyframe" as const,
      trackId: "cues",
      laneId: lane.id,
      keyframeId: "point-a",
    };
    const selection = arrangementSelectionFromItems([item]);
    const viewportRef = createRef<HTMLDivElement>();
    const onMoveItems = vi.fn();
    let projection: ((selectedIds: ReadonlySet<string>, deltaTick: number) => void) | null = null;
    let cancel: (() => void) | null = null;
    const { container } = render(
      <div ref={viewportRef}>
        <ArrangementAutomationLane
          arrangement={arrangement}
          clipboardKind={null}
          definition={definition}
          geometry={createTimelineGeometry(960, 48, 240)}
          lane={lane}
          onAdd={vi.fn()}
          onCancelReady={(next) => {
            cancel = next;
          }}
          onCopyItems={vi.fn()}
          onDeleteItems={vi.fn()}
          onDeleteKeyframes={vi.fn()}
          onDeleteLane={vi.fn()}
          onMoveItems={onMoveItems}
          onPasteAt={vi.fn()}
          onPreviewItems={(items, deltaTick) => {
            const ids = new Set(
              items
                .filter((candidate) => candidate.type === "keyframe")
                .map((candidate) => (candidate.type === "keyframe" ? candidate.keyframeId : "")),
            );
            projection?.(ids, deltaTick);
          }}
          onRegisterProjection={(_trackId, _laneId, next) => {
            projection = next;
          }}
          onResetProjection={() => projection?.(new Set(), 0)}
          onSelectKeyframe={vi.fn()}
          onSnapPreview={vi.fn()}
          onUpdateKeyframe={vi.fn()}
          revealRequest={null}
          selection={selection}
          trackId="cues"
          viewport={{ startBeat: 0, endBeat: 4 }}
          viewportRef={viewportRef}
        />
      </div>,
    );
    const point = screen.getByRole("button", { name: "Intensity keyframe at tick 960" });
    const curve = container.querySelector<SVGSVGElement>("[data-automation-curve]")!;

    fireEvent.pointerDown(point, { button: 0, pointerId: 4, clientX: 48 });
    fireEvent.pointerMove(point, { pointerId: 4, clientX: 60 });
    fireEvent.pointerMove(point, { pointerId: 4, clientX: 65 });
    expect(frames).toHaveLength(1);
    expect(onMoveItems).not.toHaveBeenCalled();
    frames.splice(0).forEach((callback) => callback(0));

    expect(point.style.transform).toContain("12px");
    expect(curve.style.left).toBe("60px");
    expect(curve.style.width).toBe("36px");
    expect(onMoveItems).not.toHaveBeenCalled();

    fireEvent.pointerUp(point, { pointerId: 4, clientX: 60 });
    expect(onMoveItems).toHaveBeenCalledOnce();
    expect(onMoveItems).toHaveBeenCalledWith([item], 240);
    expect(point.style.transform).toContain("0px");
    expect(curve.style.left).toBe("48px");
    expect(curve.style.width).toBe("48px");
    fireEvent.click(point);
    expect(screen.queryByRole("heading", { name: "Intensity keyframe" })).toBeNull();

    fireEvent.pointerDown(point, { button: 0, pointerId: 5, clientX: 48 });
    fireEvent.pointerMove(point, { pointerId: 5, clientX: 60 });
    frames.splice(0).forEach((callback) => callback(0));
    expect(cancel).not.toBeNull();
    (cancel as unknown as () => void)();
    expect(onMoveItems).toHaveBeenCalledOnce();
    expect(curve.style.left).toBe("48px");

    fireEvent.pointerDown(point, { button: 0, pointerId: 6, clientX: 48, clientY: 16 });
    fireEvent.pointerUp(point, { pointerId: 6, clientX: 48, clientY: 16 });
    fireEvent.click(point);
    expect(screen.getByRole("heading", { name: "Intensity keyframe" })).toBeTruthy();
  });
});
