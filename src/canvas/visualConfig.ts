export const CANVAS_VISUAL_CONFIG = {
  layoutDraft: {
    patchedBorder: "rgba(161, 161, 170, 0.72)",
    unpatchedBorder: "rgba(113, 113, 122, 0.65)",
  },
  glow: {
    radiusMultiplier: 2.5,
    opacityMultiplier: 0.4,
    minimumBrightness: 0.05,
    fixtureLimit: 400,
  },
} as const;
