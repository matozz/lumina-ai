export const CANVAS_VISUAL_CONFIG = {
  layoutDraft: {
    color: [139, 119, 255] as [number, number, number],
    intensity: 0.45,
  },
  glow: {
    radiusMultiplier: 2.5,
    opacityMultiplier: 0.4,
    minimumBrightness: 0.05,
    fixtureLimit: 400,
  },
} as const;
