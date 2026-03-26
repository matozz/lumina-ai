import matrixJson from "./templates/matrix.json";
import heartJson from "./templates/heart.json";
import circleJson from "./templates/circle.json";
import lissajousJson from "./templates/lissajous.json";
import spiralJson from "./templates/spiral.json";
import combinedJson from "./templates/combined.json";

export interface DslTemplate {
  key: string;
  name: string;
  dsl: string;
}

export const TEMPLATES: DslTemplate[] = [
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
    key: "combined",
    name: "4 Rects + Circle",
    dsl: JSON.stringify(combinedJson, null, 2),
  }
];
