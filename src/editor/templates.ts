import matrixJson from "./templates/matrix.json";
import heartJson from "./templates/heart.json";
import circleJson from "./templates/circle.json";
import lissajousJson from "./templates/lissajous.json";
import spiralJson from "./templates/spiral.json";
import combinedJson from "./templates/combined.json";
import rainbowWaveJson from "./templates/rainbow_wave.json";
import dimmerChaseJson from "./templates/dimmer_chase.json";
import breatheJson from "./templates/breathe.json";
import strobeJson from "./templates/strobe.json";
import panSweepJson from "./templates/pan_sweep.json";
import colorBumpJson from "./templates/color_bump.json";
import tiltBounceJson from "./templates/tilt_bounce.json";
import pixelChaseJson from "./templates/pixel_chase.json";
import chaosJson from "./templates/chaos.json";
import sineWaveJson from "./templates/sine_wave.json";
import pulseEngineJson from "./templates/pulse_engine.json";
import zigzagJson from "./templates/zigzag.json";

export interface DslTemplate {
  key: string;
  name: string;
  dsl: string;
}

export const TEMPLATES: DslTemplate[] = [
  {
    key: "combined",
    name: "4 Rects + Circle",
    dsl: JSON.stringify(combinedJson, null, 2),
  },
  {
    key: "matrix",
    name: "Classic Matrix",
    dsl: JSON.stringify(matrixJson, null, 2),
  },
  {
    key: "heart",
    name: "Heart Curve",
    dsl: JSON.stringify(heartJson, null, 2),
  },
  {
    key: "circle",
    name: "Concentric Circles",
    dsl: JSON.stringify(circleJson, null, 2),
  },
  {
    key: "lissajous",
    name: "Lissajous Knot",
    dsl: JSON.stringify(lissajousJson, null, 2),
  },
  {
    key: "spiral",
    name: "Golden Spiral",
    dsl: JSON.stringify(spiralJson, null, 2),
  },
  {
    key: "rainbow_wave",
    name: "Rainbow Wave",
    dsl: JSON.stringify(rainbowWaveJson, null, 2),
  },
  {
    key: "dimmer_chase",
    name: "Dimmer Chase",
    dsl: JSON.stringify(dimmerChaseJson, null, 2),
  },
  {
    key: "breathe",
    name: "Breathe Effect",
    dsl: JSON.stringify(breatheJson, null, 2),
  },
  {
    key: "strobe",
    name: "Strobe Bursts",
    dsl: JSON.stringify(strobeJson, null, 2),
  },
  {
    key: "pan_sweep",
    name: "Pan Sweep",
    dsl: JSON.stringify(panSweepJson, null, 2),
  },
  {
    key: "color_bump",
    name: "Color Bump",
    dsl: JSON.stringify(colorBumpJson, null, 2),
  },
  {
    key: "tilt_bounce",
    name: "Tilt Bounce",
    dsl: JSON.stringify(tiltBounceJson, null, 2),
  },
  {
    key: "pixel_chase",
    name: "Pixel Chase",
    dsl: JSON.stringify(pixelChaseJson, null, 2),
  },
  {
    key: "chaos",
    name: "Chaos Random",
    dsl: JSON.stringify(chaosJson, null, 2),
  },
  {
    key: "sine_wave",
    name: "Sine Wave Fly",
    dsl: JSON.stringify(sineWaveJson, null, 2),
  },
  {
    key: "pulse_engine",
    name: "Pulse Engine",
    dsl: JSON.stringify(pulseEngineJson, null, 2),
  },
  {
    key: "zigzag",
    name: "Zig Zag Split",
    dsl: JSON.stringify(zigzagJson, null, 2),
  }
];
