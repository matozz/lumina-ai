import { forwardRef, useId } from "react";
import type { KeyframeDSL, KeyframeInterpolationDSL, ParameterDefinitionDSL } from "@/bridge/types";
import { keyframeValueY } from "../keyframeGeometry";

interface AutomationCurveSegmentProps {
  beatWidth: number;
  definition: ParameterDefinitionDSL;
  end: KeyframeDSL;
  height?: number;
  ppq: number;
  start: KeyframeDSL;
  valueInset?: number;
}

const DEFAULT_ROW_HEIGHT = 32;

export const AutomationCurveSegment = forwardRef<SVGSVGElement, AutomationCurveSegmentProps>(
  function AutomationCurveSegment(
    { start, end, definition, height = DEFAULT_ROW_HEIGHT, ppq, beatWidth, valueInset = 4 },
    ref,
  ) {
    const gradientId = `automation-color-${useId().replace(/:/g, "")}`;
    const geometry = automationCurveGeometry(
      start,
      end,
      definition,
      ppq,
      beatWidth,
      height,
      valueInset,
    );
    return (
      <svg
        ref={ref}
        className="text-primary/80 pointer-events-none absolute top-0 overflow-visible"
        style={{ left: geometry.left, width: geometry.width, height }}
        viewBox={`0 0 ${Math.max(1, geometry.width)} ${height}`}
        preserveAspectRatio="none"
        data-automation-curve
        aria-hidden="true"
      >
        {start.value.type === "color" && end.value.type === "color" ? (
          <>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor={start.value.value} />
                {start.interpolation === "hold" && (
                  <stop offset="0.999" stopColor={start.value.value} />
                )}
                <stop offset="1" stopColor={end.value.value} />
              </linearGradient>
            </defs>
            <rect
              data-automation-color-band
              x="0"
              y={height / 2 - 5}
              width="100%"
              height="10"
              rx="3"
              fill={`url(#${gradientId})`}
              stroke="currentColor"
              strokeOpacity="0.35"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          <path
            d={geometry.path}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    );
  },
);

export function updateAutomationCurveElement(
  element: SVGSVGElement,
  start: KeyframeDSL,
  end: KeyframeDSL,
  definition: ParameterDefinitionDSL,
  ppq: number,
  beatWidth: number,
  height: number,
  valueInset: number,
  selectedIds: ReadonlySet<string>,
  deltaTick: number,
) {
  const projectedStart = selectedIds.has(start.id)
    ? { ...start, time_tick: start.time_tick + deltaTick }
    : start;
  const projectedEnd = selectedIds.has(end.id)
    ? { ...end, time_tick: end.time_tick + deltaTick }
    : end;
  const geometry = automationCurveGeometry(
    projectedStart,
    projectedEnd,
    definition,
    ppq,
    beatWidth,
    height,
    valueInset,
  );
  element.style.left = `${geometry.left}px`;
  element.style.width = `${geometry.width}px`;
  element.setAttribute("viewBox", `0 0 ${Math.max(1, geometry.width)} ${height}`);
  element.querySelector("path")?.setAttribute("d", geometry.path);
}

export function automationCurveGeometry(
  start: KeyframeDSL,
  end: KeyframeDSL,
  definition: ParameterDefinitionDSL,
  ppq: number,
  beatWidth: number,
  height: number,
  valueInset: number,
) {
  const left = (start.time_tick / ppq) * beatWidth;
  const width = ((end.time_tick - start.time_tick) / ppq) * beatWidth;
  const startY = keyframeValueY(start.value, definition, height, valueInset);
  const endY = keyframeValueY(end.value, definition, height, valueInset);
  return {
    left,
    width,
    startY,
    endY,
    path: curvePath(start.interpolation, width, startY, endY),
  };
}

export function curvePath(
  interpolation: KeyframeInterpolationDSL,
  width: number,
  startY: number,
  endY: number,
) {
  if (interpolation === "hold") return `M 0 ${startY} H ${width} V ${endY}`;
  if (interpolation === "linear") return `M 0 ${startY} L ${width} ${endY}`;
  const firstControl = interpolation === "ease_in" ? 0 : width * 0.4;
  const secondControl = interpolation === "ease_out" ? width : width * 0.6;
  return `M 0 ${startY} C ${firstControl} ${startY}, ${secondControl} ${endY}, ${width} ${endY}`;
}
