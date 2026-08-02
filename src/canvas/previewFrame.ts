import type { AttributeValue, FixtureFramePayload } from "../bridge/types";

const INTENSITY_ATTRIBUTE = "intensity";
const COLOR_RGB_ATTRIBUTE = "color.rgb";
const PAN_ATTRIBUTE = "position.pan";
const TILT_ATTRIBUTE = "position.tilt";

export interface PreviewFixtureOutput {
  id: number;
  r: number;
  g: number;
  b: number;
  dimmer: number;
  pan?: number;
  tilt?: number;
}

export function toPreviewOutput(frame: FixtureFramePayload): PreviewFixtureOutput {
  const attributes = new Map(frame.attributes.map((attribute) => [attribute.id, attribute.value]));
  const color = readColor(attributes.get(COLOR_RGB_ATTRIBUTE));
  const pan = readAngle(attributes.get(PAN_ATTRIBUTE));
  const tilt = readAngle(attributes.get(TILT_ATTRIBUTE));

  return {
    id: frame.id,
    r: color[0],
    g: color[1],
    b: color[2],
    dimmer: readScalar(attributes.get(INTENSITY_ATTRIBUTE)),
    ...(pan === undefined ? {} : { pan }),
    ...(tilt === undefined ? {} : { tilt }),
  };
}

function readScalar(value: AttributeValue | undefined): number {
  return value?.type === "scalar" ? Math.max(0, Math.min(1, value.value)) : 0;
}

function readColor(value: AttributeValue | undefined): [number, number, number] {
  return value?.type === "color" ? [...value.value] : [0, 0, 0];
}

function readAngle(value: AttributeValue | undefined): number | undefined {
  return value?.type === "angle" ? value.value : undefined;
}
