# Authoring V1 consolidation evidence

- Date: 2026-08-08
- Build: macOS debug application from `codex/authoring-v1-consolidation`
- Windows checked: 1302×768 authoring pass and exact 1100×720 minimum-window pass

## Acceptance summary

- All authoring workspaces opened at 128 BPM with the Play action available; switching workspaces and selecting assets did not start playback.
- All 26 built-in Layouts were selected in Stage and visually inspected at both sparse and dense capacities. Matrix quantity edits changed capacity without changing Gap X/Gap Y.
- `Use on Stage` applied the 12×16 Festival Matrix as 192 fixtures and then restored the 20×20 Main Matrix as 400 fixtures. Effect Lab used the same active Stage counts and coordinates.
- The 20×20 Stage exposed four 2×2 quadrants of 100 fixtures and four selected 4×4 corner regions of 25 fixtures. Cue Layers retained their TargetSet bindings.
- A two-Layer Cue targeted the 2×2 top-left and top-right areas. An attempted same-attribute overlap without an explicit MixPolicy was rejected before the non-overlapping TargetSet was selected.
- Arrange scheduled overlapping CueClips at tick 0, a following CueClip at tick 3840, and a typed Speed automation lane with keyframes at ticks 3840 and 7680 (1× to 2×). The CueClip inspector contained timing, playback, and layer controls, but no TargetSet selector.
- Live accepted the current Arrangement, entered stopped, rendered a targeted Live Pad during rehearsal, reported a 60 FPS target, and showed no output errors.
- Asset export completed and the downloaded pack was imported back through the native file chooser; the application reported eight imported assets. The Reset confirmation explicitly states that downloaded asset packs are not affected.
- At exactly 1100×720, Stage and Arrange retained usable controls, independent scrolling, and stable panel widths. A narrow-inspector button collision discovered during this pass was fixed and rechecked.

## Built-in Layout review

| Generator | Presets reviewed                                                            | Result                                                                               |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Matrix    | Main Matrix 20×20; Festival Matrix 12×16                                    | Symmetric grids; capacity and gaps remain independent                                |
| Wall      | Wide Video Wall 12×24; Pixel Wall 20×20                                     | Dense rectangular walls remain evenly pitched                                        |
| Strip     | Runway Strip 160; Vertical Tower Strip 120                                  | Horizontal and vertical directions remain linear and evenly spaced                   |
| Frame     | Arena Perimeter 24×40; Proscenium Frame 16×36; Portrait Portal Frame 32×16  | Corners and edges remain balanced without duplicate corner fixtures                  |
| Circle    | Concentric Arena Rings; Club Ceiling Rings; Festival Halo Rings             | Rings remain concentric and readable at low and high counts                          |
| Sector    | Audience Fan Sector; Front Wash Sector 90°; Stage Wing Sector 150°          | Radial fans retain clear angular and radial spacing                                  |
| Polygon   | Hexagonal Truss 144; Triangle Truss 84; Square Truss 96; Pentagon Truss 110 | Perimeters remain closed, symmetric, and evenly distributed                          |
| Honeycomb | Honeycomb Ceiling 18×24; Compact Honeycomb 16×20; Open Honeycomb 12×18      | Staggered rows retain uniform nearest-neighbor spacing                               |
| Formula   | Sine Ribbon 160; Arch 160                                                   | Every authored position materializes; mounting the canvas replays the latest preview |
| Algorithm | Lissajous 240; Spiral 200                                                   | Every authored position materializes with finite, stable coordinates                 |

Custom/Freeform and SVG Path were present only as unavailable/read-only authoring entries, as required for V1.

## Screenshots

| Evidence                                                                       | What it establishes                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [01-stage-matrix-20x20-large.jpg](01-stage-matrix-20x20-large.jpg)             | Main Matrix 20×20, 400-position large-window Stage baseline        |
| [02-stage-circle-rings.jpg](02-stage-circle-rings.jpg)                         | Concentric Circle geometry                                         |
| [03-stage-sector.jpg](03-stage-sector.jpg)                                     | First-class Sector geometry                                        |
| [04-stage-polygon-hex.jpg](04-stage-polygon-hex.jpg)                           | First-class Polygon geometry                                       |
| [05-stage-honeycomb.jpg](05-stage-honeycomb.jpg)                               | First-class Honeycomb geometry                                     |
| [06-stage-festival-halo.jpg](06-stage-festival-halo.jpg)                       | Dense halo/ring spacing                                            |
| [07-stage-formula-sine.jpg](07-stage-formula-sine.jpg)                         | Formula preview after the replay-on-mount fix                      |
| [08-effect-lab-festival-matrix-192.jpg](08-effect-lab-festival-matrix-192.jpg) | Stage → Effect Lab parity at 192 fixtures and 128 BPM              |
| [09-targetsets-20x20-2x2.jpg](09-targetsets-20x20-2x2.jpg)                     | 2×2 TargetSet quadrant contains 100 of 400 fixtures                |
| [10-cue-multilayer-quadrants.jpg](10-cue-multilayer-quadrants.jpg)             | Two Cue Layers bound to independent quadrants                      |
| [11-arrange-overlap-automation.jpg](11-arrange-overlap-automation.jpg)         | Overlap, sequential placement, and typed automation                |
| [12-live-rehearsal.jpg](12-live-rehearsal.jpg)                                 | Live targeted output, rehearsal controls, and diagnostics          |
| [13-assets-import-export.jpg](13-assets-import-export.jpg)                     | User asset pack export/import entry points                         |
| [13b-assets-roundtrip.jpg](13b-assets-roundtrip.jpg)                           | Completed asset-pack round trip with eight imported assets         |
| [14-reset-defaults-confirmation.jpg](14-reset-defaults-confirmation.jpg)       | Scoped Reset contract and exported-pack preservation               |
| [15-min-window-arrange-1100x720.jpg](15-min-window-arrange-1100x720.jpg)       | Fixed Arrange layout at the exact minimum window                   |
| [16-min-window-stage-1100x720.jpg](16-min-window-stage-1100x720.jpg)           | Stage layout and independent scrolling at the exact minimum window |

## Non-visual verification

- Generator parity and golden checks cover TypeScript and Rust capacity/coordinate semantics.
- Rust authoring preview coverage materializes every Formula and Algorithm position and rejects non-finite coordinates.
- Project state tests cover scoped old-cache reset, 26 built-in Layout restoration, 400-fixture default Patch restoration, and no playback after asset import.
- UserAssetPack tests cover dependency-complete export, cross-project import, conflict reporting, deterministic rename, malformed-pack rejection, and missing transitive dependencies.
- WorkspaceHeader tests cover one-action Live activation and Reset without replacing current live output.

## Final quality gate

- `pnpm check:all`: passed.
- Schema check and Production Catalog semantic/golden check: passed (`16` Effects and `11` Cue recipes).
- Frontend: `68` test files and `214` tests passed; TypeScript and Prettier checks passed.
- Vite production build: passed. The existing warning for a JavaScript chunk larger than 500 kB remains.
- Rust: `cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` passed; `120` library tests, `8` document-contract tests, `1` show golden, and `3` Production Catalog golden tests passed.
- Live was verified through Lumina's preview adapter; no physical lighting interface was connected during this desktop pass.

The retained screenshots are representative visual evidence; the complete 26-preset selection pass was performed in the same application session.
