# Lumina AI — Agent Guidelines

Lumina is a high-performance lighting-show authoring and sequencing application with a React/TypeScript frontend and Rust/Tauri runtime.

## Source of truth

Read [`docs/authoring/README.md`](docs/authoring/README.md) before changing authoring behavior, contracts, Catalog assets or runtime compilation. It is the only current authoring guide and links to the focused Project, Layout, Effect, Cue, Arrangement, Catalog and Schema documents.

Relevant accepted decisions:

- [`ADR-0001`](docs/adr/0001-clock-transport-render-at.md): clock, transport and deterministic rendering.
- [`ADR-0002`](docs/adr/0002-schema-authority-and-generation.md): current V1 authority and generated contracts.
- [`ADR-0003`](docs/adr/0003-musical-time-and-timeline-evaluation.md): integer musical time and pure timeline evaluation.
- [`ADR-0004`](docs/adr/0004-fixture-attributes-and-mix-policy.md): typed fixture attributes and explicit mixing.
- [`ADR-0005`](docs/adr/0005-effect-graph-and-typed-ports.md): EffectGraph and typed ports.
- [`ADR-0010`](docs/adr/0010-tempo-map-stage-effect-cue-arrangement-assets.md): asset ownership and exact references.
- [`ADR-0011`](docs/adr/0011-authoring-preview-clock-transport-timeline.md): authoring transport and timeline performance.
- [`ADR-0012`](docs/adr/0012-layout-preset-stage-upgrade-targeting.md): Layout generators, Stage application and targeting.
- [`ADR-0013`](docs/adr/0013-production-catalog-safe-authoring-validation.md): built-in Catalog and validation.

The Authoring V1 guide and the current user request take precedence if an older ADR contains historical wording.

## Frontend rules

- Use `cn()` from `src/lib/utils.ts` to merge Tailwind classes.
- Do not introduce a React drag-and-drop library for the timeline. Pointer move, resize, keyframe and playhead paths use native Pointer Events, DOM refs and `requestAnimationFrame`; commit store/history state only at the gesture boundary.
- Use Zustand for cross-workspace state. Keep local state for low-frequency form sessions.
- Keep components focused; split components that become difficult to review or exceed roughly 200–300 lines.
- Preserve a fully operable 1100×720 layout and verify common larger windows.

## Rust/Tauri rules

- Document and compiler logic lives in `src-tauri/src/document/` and `src-tauri/src/compiler/`; real-time evaluation lives in `src-tauri/src/engine/`.
- Use Tokio for scheduling and keep blocking work off the main thread and render path.
- Validate and resolve strings/references before compilation. The render path uses typed handles and precomputed caches.
- Tauri commands are registered in `src-tauri/src/commands.rs` and `src-tauri/src/lib.rs`; return errors the frontend can present, normally through `Result<T, String>`.

## Workflow

1. Create or switch to a semantic branch before committing. Use names such as `codex/authoring-v1-consolidation` or `codex/fix-timeline-drag-jitter`, never bookkeeping names.
2. Make incremental semantic commits and follow `CONTRIBUTING.md` commit conventions.
3. Before each commit, review for debugging logs, stale comments, redundant branches and unrelated changes.
4. Use `pnpm` for JavaScript dependencies and commands.
5. Run `pnpm check:all` before completion. Contract changes also require reviewing generated Schema/TypeScript and Catalog Golden diffs.
6. Use real-window testing for user-facing workflows; type checking alone is not acceptance.
7. Do not push or open a pull request unless the user explicitly asks.
