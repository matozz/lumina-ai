# Stage 7.5A Authoring Workflow acceptance

> Date: 2026-08-04
>
> Branch: `codex/authoring-transport-timeline`
>
> Baseline: `main@411656f`
>
> Scope: Stage 7.5A only; LayoutPreset, dynamic Targeting and Production Catalog remain unimplemented.

## Automated gates

- `pnpm test`: 55 files / 141 tests passed, including the final 1,000-CueClip viewport assertion.
- `pnpm build`: TypeScript and Vite production build passed. The pre-existing large-chunk warning
  remains the only warning.
- `pnpm format:check`: passed.
- `pnpm check:rust`: Rust formatting, strict Clippy and all Cargo tests passed. The Rust unit binary
  ran 101 tests; 12 integration/contract tests remain present across the four integration targets.
- `pnpm tauri build --debug --bundles app`: produced the current native bundle at
  `src-tauri/target/debug/bundle/macos/Lumina AI.app`.

The focused tests cover 3/4, 4/4, arbitrary meter changes, multi-segment TempoMap wall-clock
conversion, 30-minute roundtrip, Local/Follow Arrangement session state, Stop/Seek/Loop, project
save/reopen, Draft/Published/Live isolation, zoom/snap, CueClip move/resize/keyboard/inspector,
typed automation curves/keyframes, action-local recovery, one-transaction Undo, rAF-only pointer
preview and 1,000-CueClip viewport filtering.

## Native Tauri path

The app-only debug bundle was opened by its exact path so an older cached bundle could not be used
as evidence. The available host display produced a maximized 1240×768 capture; the repository's
window configuration test continues to enforce maximized startup and the existing minimum-size
contract.

Observed without Raw DSL:

1. Effect Lab exposed Play/Pause/Stop/Seek/Loop, BPM, meter, `bar.beat.tick`, beat meter, Local and
   Follow Arrangement. A Local 128 BPM, 3/4, two-bar session played, paused and stopped back at
   `1.1.0`.
2. Cues exposed the same controls. Follow Arrangement changed the selected Cue from its 120 BPM
   Local clock to the selected Arrangement's 128 BPM / 4/4 clock. Returning to Effect Lab retained
   the independent 128 BPM / 3/4 / two-bar session.
3. Arrange opened `Tempo Journey` with three tempo points, a pinned CueClip and a typed master
   automation curve. Seeking to the end changed current BPM from 128 to 150, and ruler pointer seek
   returned it to 128 at tick 0.
4. Zoom changed adaptive snap from half-beat to quarter-beat. CueClip selection exposed pinned Cue
   revision, start, duration, source offset, layer and playback. Keyboard nudge and Alt+Arrow resize
   each produced one Undo step and were restored independently.
5. A double-click added a third typed master-dimmer keyframe. Its inspector displayed
   meter-aware `2.1.240`, TempoMap-aware seconds, typed percent value and interpolation. The edit and
   added keyframe were restored with two explicit Undo operations.
6. An invalid Arrangement loop end displayed `AUTHORING_LOOP_INVALID`, its path, cause, hint and
   `Use full Arrangement range` recovery next to the loop controls. Recovery restored the full
   range without changing the Arrangement asset.
7. Live/Rehearse continued to show `Published — / Live —`, a disabled Take Live action and explicit
   Draft rehearsal selection. Authoring operations did not Publish or Take Live.
8. After closing and reopening the current debug app, `Tempo Journey`, its three tempo points,
   CueClip and two-keyframe automation lane remained. Authoring cursor and Timeline zoom returned to
   session defaults. Effect/Cue local-timing non-persistence is also asserted directly against the
   serialized Project store.

All temporary native edits were reverted through the product Undo path before handoff.

## Exit decision

Stage 7.5A satisfies its scoped exit conditions. Stage 7.5 remains `in_progress` because 7.5B–7.5E
are separate future scopes. This handoff stops before LayoutPreset, Stage revision upgrade, dynamic
Targeting, Production Catalog, audio, automatic Publish or automatic Take Live.
