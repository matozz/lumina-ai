export const CANVAS_VISUAL_CONFIG = {
  layoutDraft: {
    color: [161, 161, 170] as [number, number, number],
    intensity: 0.55,
  },
  glow: {
    radiusMultiplier: 2.5,
    opacityMultiplier: 0.4,
    minimumBrightness: 0.05,
    fixtureLimit: 400,
  },
} as const;
