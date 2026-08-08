# Lumina AI

Lumina is a high-performance lighting-show authoring and sequencing application built with Tauri 2, React 19, TypeScript and Rust.

## Authoring model

```text
Layout → Stage / Patch / TargetSet → Effect → Cue Layer → Arrangement CueClip → Live
```

The application provides five focused workspaces:

- **Stage** builds fixture topology, layouts and reusable target areas.
- **Lab** previews and customizes target-agnostic effects.
- **Cues** binds effects to Stage target areas in one or more layers.
- **Arrange** schedules CueClips with musical time and typed automation.
- **Live** validates and activates the selected Arrangement as an immutable runtime snapshot.

Built-in layouts, effects, cue recipes, arrangements and project templates are declarative JSON under `catalog/builtin/`. Project-owned assets live in a `ProjectBundle` and can be moved between projects with user asset packs.

The complete current V1 guide is [`docs/authoring/README.md`](docs/authoring/README.md). Contributors should also read [`AGENTS.md`](AGENTS.md).

## Architecture

- **Frontend:** React, TypeScript, Tailwind CSS and Zustand. Timeline drag/resize and playhead updates use native Pointer Events and DOM refs for smooth 60fps interaction.
- **Backend:** Rust, Tokio and Tauri. Strict V1 documents compile into typed handles and precomputed spatial/time caches; `render_at` deterministically evaluates any tick.
- **Contracts:** Rust document types generate checked-in JSON Schema and TypeScript artifacts. Project loading and saving accept only the current V1 during this internal-development baseline.

## Getting started

Requirements are pinned in the repository: Node.js 22.20.0, pnpm 10.33.0 and Rust 1.94.1.

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
```

Run the complete local quality gate with:

```sh
pnpm check:all
```

See [`docs/development.md`](docs/development.md) for individual checks and Catalog/Schema update commands.

## Project structure

- `catalog/builtin/`: source-controlled built-in assets and Generator Registry.
- `schemas/` and `src/generated/`: checked-in V1 contracts.
- `src/workspace/`: Stage, Lab, Cues, Arrange and Live UI.
- `src/panel/`: performance-sensitive timeline primitives.
- `src/stores/`: Project, workspace, engine and authoring session state.
- `src-tauri/src/document/`: Rust document contracts and validation.
- `src-tauri/src/compiler/`: Project/Show compilation.
- `src-tauri/src/engine/`: deterministic evaluation and output frames.

## License

MIT License
