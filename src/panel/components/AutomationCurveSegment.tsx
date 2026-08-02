import type { KeyframeDSL, KeyframeInterpolationDSL, ParameterDefinitionDSL } from "@/bridge/types";
import { keyframeValueY } from "../keyframeGeometry";

interface AutomationCurveSegmentProps {
  beatWidth: number;
  definition: ParameterDefinitionDSL;
  end: KeyframeDSL;
  ppq: number;
  start: KeyframeDSL;
}

const ROW_HEIGHT = 32;

export const AutomationCurveSegment = ({
  start,
  end,
  definition,
  ppq,
  beatWidth,
}: AutomationCurveSegmentProps) => {
  const left = (start.time_tick / ppq) * beatWidth;
  const width = ((end.time_tick - start.time_tick) / ppq) * beatWidth;
  const startY = keyframeValueY(start.value, definition, ROW_HEIGHT);
  const endY = keyframeValueY(end.value, definition, ROW_HEIGHT);
  return (
    <svg
      className="pointer-events-none absolute top-0 h-8 overflow-visible text-amber-400/70"
      style={{ left, width }}
      viewBox={`0 0 ${Math.max(1, width)} ${ROW_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={curvePath(start.interpolation, width, startY, endY)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

function curvePath(
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
