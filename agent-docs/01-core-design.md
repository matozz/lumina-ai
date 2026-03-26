# Lumina AI Core Design & Architecture

## System Overview

Lumina AI is a specialized lighting show engine combining a React-based frontend sequencer with a high-performance Rust backend. The system operates on a dual-mode architecture:
1. **Live Mode**: For real-time, interactive lighting control.
2. **Timeline Mode**: For precise, non-linear sequencing and show programming.

## Architecture Paradigm

### Frontend (React + TypeScript)
- **State Management**: Uses `zustand` for global state (UI mode, execution state).
- **Styling**: Tailwind CSS with `clsx` and `tailwind-merge` (via `src/utils/cn.ts`).
- **Timeline Engine**: Custom-built using native Pointer Events API for 60fps drag-and-drop. It bypasses React's render cycle during drag/resize operations by manipulating DOM `ref`s directly.
- **Component Design**: Highly modular. The `TimelineView` is composed of smaller subcomponents (`TimelineToolbar`, `TimelineResourcePanel`, `TimelineGrid`, `TimelinePlayhead`, `TimelineTrackHeaders`).

### Backend (Rust + Tauri)
- **Core Engine**: Handles the actual execution of lighting states.
- **DSL Compiler**: Parses and compiles custom JSON-based DSL payloads into executable sequences.
- **Scheduler**: Tokio-based asynchronous scheduler for precise timing and playback execution.

## Data Flow
1. User interacts with the React UI (e.g., placing a phaser on the timeline).
2. Frontend updates its internal JSON representation of the timeline.
3. Upon play/compilation, the frontend generates a DSL string or JSON payload and sends it to the Rust backend via Tauri IPC (`invoke`).
4. Rust backend compiles the payload, schedules the events, and executes the lighting outputs.

## Key Design Constraints
- **Performance First**: The timeline UI must never drop frames during interaction. Avoid `setState` during rapid events like `onPointerMove`. Use `useRef` for mutable values that don't need to trigger re-renders.
- **Single Source of Truth**: The Rust backend is the ultimate source of truth for lighting state. The frontend is primarily a visualization and authoring tool.