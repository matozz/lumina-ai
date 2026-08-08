# Authoring V1 follow-up evidence

- Date: 2026-08-08
- Build: macOS debug application from `codex/authoring-v1-consolidation` at `a95ad9b`
- Windows checked: 1302×768 for the workflow pass and 1103×768 for the revised Arrange minimum-width pass
- Related baseline: [original Authoring V1 consolidation evidence](../authoring-v1-consolidation/README.md)

## Acceptance summary

- Formula and Algorithm presets are available in the ordinary Stage `Generated` group. Sine Ribbon, Lissajous and Spiral all materialize their complete position counts without requiring Advanced mode.
- The 200-position Spiral uses equal-chord sampling, eliminating the dense inner coil. The 240-position Lissajous uses equal-arc sampling. Automated spacing checks keep adjacent-distance ratios below `1.08` in both TypeScript and Rust.
- Effect Lab keeps Breathe and removes the redundant intensity Pulse. Column Ping-Pong and Seeded Column Rain provide distinct spatial motion, stay deterministic at a fixed seed/tick and visibly animate on the 20×20 Stage.
- Fixture glow is centralized in `CANVAS_VISUAL_CONFIG.glow`. The fixture radius is half the larger fixture dimension; the glow radius is that value multiplied by `radiusMultiplier` (`2.5` in V1). Opacity, minimum brightness and the 400-fixture performance cutoff are controlled beside it.
- Quadrant Motion · 128 drives four 10×10 quadrants from one four-Layer Cue and exposes typed Speed automation. Four Corner Chase · 128 schedules five staggered CueClips over four selected 5×5 corner TargetSets.
- The four Quadrant Motion Cue Layers bind Column Ping-Pong, Seeded Column Rain, Gradient Drift and Breathe to top-left, top-right, bottom-left and bottom-right TargetSets respectively. The Arrangement CueClip inspector contains no TargetSet selector.
- Stage, Effect Lab, Cues, Arrange and Live were walked in the macOS application at 128 BPM. Workspace and asset selection remained stopped; only explicit Play started preview.
- The current Quadrant Motion Arrangement was sent to Live. Live opened stopped, reported a 60 FPS target, 0.0 ms frame lag and no output errors.
- The revised Arrange view remains operable at 1103 pixels wide without horizontal overflow or hidden actions. The baseline evidence retains the exact 1100×720 Stage and Arrange checks.

## Screenshots

| Evidence                                                       | What it establishes                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| [01-lissajous-visible.jpg](01-lissajous-visible.jpg)           | 240-position Algorithm preview, symmetric and evenly sampled       |
| [02-spiral-uniform-spacing.jpg](02-spiral-uniform-spacing.jpg) | 200-position Spiral with no dense inner coil                       |
| [03-formula-visible.jpg](03-formula-visible.jpg)               | Formula preset visible in the ordinary Generated library           |
| [04-column-ping-pong.jpg](04-column-ping-pong.jpg)             | Distinct left/right traveling column in Effect Lab                 |
| [05-seeded-column-rain.jpg](05-seeded-column-rain.jpg)         | Seeded columns rolling vertically at different phases              |
| [06-quadrant-arrangement.jpg](06-quadrant-arrangement.jpg)     | Four-zone simultaneous Cue, two clips and Speed automation         |
| [07-four-corner-chase.jpg](07-four-corner-chase.jpg)           | First 5×5 corner active with staggered clips visible               |
| [08-four-corner-overlap.jpg](08-four-corner-overlap.jpg)       | Two disjoint bottom 5×5 regions active during clip overlap         |
| [09-quadrant-cue-layers.jpg](09-quadrant-cue-layers.jpg)       | Four Effect layers and the selected bottom-right TargetSet binding |
| [10-live-arrangement.jpg](10-live-arrangement.jpg)             | Current Arrangement in Live, stopped, with clean diagnostics       |
| [11-min-window-arrange.jpg](11-min-window-arrange.jpg)         | Revised multi-region Arrange at 1103-pixel window width            |

## Automated verification

- Frontend: `69` test files and `218` tests passed.
- Rust: `122` library tests, `8` document-contract tests, `1` show golden and `5` Production Catalog tests passed.
- `pnpm check:all`, `pnpm build`, `cargo fmt --check`, and Clippy with `-D warnings` passed.
- Schema, generated contracts, Catalog semantic validation, compatibility matrix and Goldens passed with `17` Effects and `11` Cue recipes.
- The only retained build warning is Vite's known JavaScript chunk-size warning above 500 kB.
- Live used Lumina's preview adapter; no physical lighting interface was connected during this pass.
