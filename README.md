# Lumina AI

A modern, high-performance timeline and sequencer engine for lighting shows, built with Tauri 2.0, React, TypeScript, and Rust.

> **🤖 Vibe Coding & AI-Driven Development**
> Lumina AI embraces "Vibe Coding" — it is heavily guided and iterated upon by AI agents. For AI assistants contributing to this project, please refer to the [`AGENTS.md`](./AGENTS.md) file at the root of the repository, as well as the architectural specifications in the [`/agent-docs`](./agent-docs/) directory.

## Architecture

Lumina AI leverages a hybrid architecture for optimal performance:

- **Frontend**: React + TypeScript + Tailwind CSS, featuring a highly optimized custom timeline renderer with native Pointer Events API for zero-lag 60fps drag-and-drop interactions.
- **Backend**: Rust + Tauri, executing a powerful custom DSL (Domain Specific Language) that drives the actual lighting show execution.

## Key Features

- **Professional Sequencer UI**: Inspired by industry-standard DAWs like Ableton Live, featuring a fluid timeline with precise beat-grid snapping.
- **Dual Operating Modes**:
  - `Live Mode`: Real-time triggering of lighting phasers.
  - `Timeline Mode`: Non-linear editing and sequencing with multi-track support.
- **Advanced Timeline Interactions**:
  - Drag-and-drop sequencing of phasers.
  - Edge-dragging for precise block resizing and duration adjustments.
  - Auto-overlap resolution (blocks automatically trim when colliding).
  - Keyframe-based animation parameters directly in the timeline.
- **High-Performance Rendering**: Utilizes direct DOM manipulation via Refs to bypass React's render cycle during drag operations, achieving perfectly smooth 60fps UI updates.
- **Custom DSL Engine**: A robust Rust backend that parses and executes custom JSON-based DSL payloads in real-time.

## Custom JSON DSL Example

Lumina AI uses a powerful JSON-based Domain Specific Language (DSL) to define fixtures, layouts, groups, and dynamic lighting effects (Phasers). This allows for precise, programmable control over the entire show.

Here is an example of defining a matrix of lights and creating a "Blink" phaser effect:

```json
{
  "meta": {
    "name": "Matrix Demo"
  },
  "patch": [
    {
      "type": "spot",
      "id_range": [1, 64]
    }
  ],
  "layout": {
    "type": "generator",
    "generator": {
      "shape": "matrix",
      "rows": 8,
      "columns": 8,
      "spacing": 40,
      "origin": [0, 0]
    }
  },
  "groups": [
    {
      "name": "All Spots",
      "fixtures": { "range": [1, 64] },
      "sort_by": "none"
    }
  ],
  "phasers": [
    {
      "id": "blink",
      "name": "Blink",
      "target": "All Spots",
      "multiplier": 1,
      "steps": [
        {
          "values": { "color": "#ffffff", "dimmer": 1 },
          "width": 50,
          "transition": 0
        },
        {
          "values": { "color": "#000000", "dimmer": 0 },
          "width": 50,
          "transition": 0
        }
      ],
      "phase": {
        "mode": "spread",
        "spread": { "from": 0, "to": 100 }
      }
    }
  ],
  "timeline": {
    "events": [
      {
        "beat": 0,
        "duration": 4,
        "action": {
          "type": "phaser",
          "phaser": "blink"
        }
      }
    ]
  }
}
```

## Tech Stack

- **Framework**: [Tauri 2.0](https://v2.tauri.app/)
- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS v4, `clsx`, `tailwind-merge`
- **Icons**: Lucide React
- **Editor**: Monaco Editor
- **Backend**: Rust, Tokio

## Getting Started

### Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/) 22.20.0
- [pnpm](https://pnpm.io/) 10.33.0
- [Rust](https://www.rust-lang.org/tools/install) 1.94.1 with rustfmt and Clippy

See [`docs/development.md`](docs/development.md) for the pinned toolchain and unified local/CI checks.

- [Tauri Dependencies](https://v2.tauri.app/start/prerequisites/) for your specific OS.

### Installation

1. Clone the repository
2. Install frontend dependencies:
   ```bash
   pnpm install
   ```

### Development

Run the application in development mode:

```bash
pnpm tauri dev
```

### Building for Production

To build the executable for your current platform:

```bash
pnpm tauri build
```

## Project Structure

- `/src`: Frontend React application
  - `/components`: Reusable UI components
  - `/panel`: Timeline and Sequencer UI components
  - `/editor`: Monaco editor integration for DSL
  - `/stores`: Zustand state management
  - `/lib`: Utility functions (e.g., `cn` for Tailwind)
- `/src-tauri`: Rust backend application
  - `/src/engine`: Core playback and timeline execution engine
  - `/src/compiler`: DSL parsing and compilation
  - `/src/scheduler`: Real-time execution scheduler

## License

MIT License
