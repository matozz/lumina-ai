# Lumina AI - Agent Guidelines

Welcome, AI Coding Assistant! This file (`AGENTS.md`) is your central source of truth for understanding how to work on **Lumina AI**. We embrace **Vibe Coding** and heavily rely on AI agents to drive the project forward, iterate on the timeline UI, and expand the Rust DSL engine.

## Project Context

Lumina AI is a high-performance timeline and sequencer engine for lighting shows.
- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite. Built for 60fps drag-and-drop sequencing.
- **Backend**: Rust, Tokio, Tauri 2.0. Compiles a custom Domain Specific Language (DSL) and acts as the real-time execution engine.

## Coding Conventions

### Frontend (React / UI)
- **Styling**: Always use the `cn()` utility (`src/utils/cn.ts`) to merge Tailwind classes. Avoid string interpolation like `` `class ${condition ? 'active' : ''}` ``.
- **Performance**: The timeline (`src/panel/`) requires strictly optimized rendering. For drag and drop, **do not** use React DND libraries. We use native `PointerEvents` and directly manipulate DOM `ref`s to bypass React's render cycle during frame-by-frame updates.
- **State**: Use `zustand` (`src/stores/uiStore.ts`) for global state. Use local component state only for non-performance-critical logic.
- **Component Granularity**: Keep components focused. Break them down if they exceed 200-300 lines (e.g., `TimelineView.tsx` is composed of smaller subcomponents).

### Backend (Rust / Tauri)
- **Architecture**: Core execution logic lives in `src-tauri/src/engine/`. DSL parsing lives in `src-tauri/src/compiler/`.
- **Concurrency**: Use `tokio` for scheduling. Keep blocking operations off the main thread.
- **Error Handling**: Bubble errors up to the frontend using `Result<T, String>` so the UI can gracefully inform the user.
- **Adding Commands**: Register new Tauri commands in `src-tauri/src/commands.rs` and wire them up in `src-tauri/src/lib.rs`.

## Workflow & Commands

### Setup & Run
- **Install dependencies**: `pnpm install` (always use `pnpm`).
- **Run Frontend/Backend in Dev**: `pnpm tauri dev`
- **Build**: `pnpm tauri build`
- **Format / Check**: Ensure to run `pnpm build` (which includes `tsc` check) before declaring a task complete to ensure no TypeScript compilation errors were introduced.

### Iterating on the DSL
If the user asks to add a new keyword to the `.lumina` DSL:
1. Update `src-tauri/src/compiler/parser.rs` to recognize the new syntax.
2. Implement execution logic in `src-tauri/src/engine/`.
3. Inform the frontend of the new capability (update UI templates/Monaco editor support if applicable).

## Agent Specific Notes
- Read the detailed architectural documents in `/agent-docs/` before undertaking large refactors:
  - `agent-docs/01-core-design.md`
  - `agent-docs/02-iteration-guide.md`
  - `agent-docs/03-dsl-guide.md`
- Provide objective, precise code. If a solution involves modifying the native timeline drag logic, think very carefully about 60fps performance and DOM ref mutations vs React re-renders.
- We trust you to auto-resolve TypeScript errors found during `pnpm build` checks.