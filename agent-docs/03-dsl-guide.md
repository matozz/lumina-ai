# Domain Specific Language (DSL) Guide

Lumina AI uses a custom JSON-based DSL to define lighting shows, phasers, and sequences. This allows for programmatic generation and precise control over the show engine.

## DSL Architecture

The DSL is written as JSON in the frontend's Monaco Editor and is parsed/executed by the Rust backend. 

### Key Components

1. **JSON Parser / Deserializer (`src-tauri/src/compiler/mod.rs`)**: 
   - Reads the JSON string payload.
   - Uses `serde_json` to map JSON fields to internal Rust engine structures (e.g., `Phaser`, `Sequence`).
2. **Execution Engine (`src-tauri/src/engine/`)**:
   - Takes the compiled structures and schedules them for output.

## How to Drive the DSL

### From the Frontend

When a user modifies the DSL in the editor (`src/editor/DslEditor.tsx`):
1. The text is captured via Monaco Editor's `onChange`.
2. A debounced call is made to the Tauri backend using `invoke('compile_dsl', { script: text })`.
3. If successful, the UI updates to show the generated Phasers or Presets.
4. If there's a JSON syntax error, the backend returns the error, which can be mapped to Monaco Editor markers.

### Timeline to DSL

The Timeline mode acts as a visual generator for the DSL:
1. When blocks are arranged on the timeline, the frontend maintains a JSON representation.
2. This JSON acts as the intermediate format that both the UI and the Rust backend understand.

### Updating the DSL Syntax

If you are asked to add a new command or capability to the DSL (e.g., a new effect like `Strobe`):
1. **Rust Deserialization**: Update the Rust `struct`s and `Deserialize` implementations in `src-tauri/src/compiler/mod.rs` or `src-tauri/src/engine/` to recognize the new fields.
2. **Rust Engine**: Create the underlying logic in `src-tauri/src/engine/` that handles how a `Strobe` behaves over time.
3. **TypeScript Definitions**: Update any TypeScript interfaces and default templates in the frontend (`src/editor/templates/*.json`) so the Monaco editor and UI can utilize the new capabilities.
## Phasers and Timing

Phasers use a `multiplier` instead of an absolute speed (BPM) value to ensure they stay perfectly synchronized with the global master tempo.

### Speed Multiplier

- `multiplier`: A relative float value that multiplies the global BPM.
  - `1.0`: The phaser completes exactly one full cycle (360 degrees) per beat.
  - `2.0`: Double speed (two cycles per beat).
  - `0.5`: Half speed (one cycle every two beats).
  - Default is `1.0` if omitted.

Example of a Phaser:
```json
{
  "name": "Hard Chase",
  "target": "Circle",
  "multiplier": 2.0,
  "steps": [
    { "values": { "dimmer": 1.0, "color": "#ffffff" }, "width": 10, "transition": 0 },
    { "values": { "dimmer": 0.0 }, "width": 90, "transition": 0 }
  ],
  "phase": { "mode": "spread", "spread": { "from": 0, "to": 360 } }
}
```

Note: Layout information (like `circle` or `matrix`) is now defined globally in the `layout` and `groups` sections of the DSL, rather than directly inside individual phasers.
