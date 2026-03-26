# Domain Specific Language (DSL) Guide

Lumina AI uses a custom DSL to define lighting shows, phasers, and sequences. This allows for programmatic generation and precise control over the show engine.

## DSL Architecture

The DSL is written in the frontend's Monaco Editor and is parsed/executed by the Rust backend. 

### Key Components

1. **Parser (`src-tauri/src/compiler/parser.rs`)**: 
   - Reads the raw `.lumina` text.
   - Tokenizes and constructs an Abstract Syntax Tree (AST).
2. **Compiler (`src-tauri/src/compiler/mod.rs`)**:
   - Translates the AST into internal Rust engine structures (e.g., `Phaser`, `Sequence`).
3. **Execution Engine (`src-tauri/src/engine/`)**:
   - Takes the compiled structures and schedules them for output.

## How to Drive the DSL

### From the Frontend

When a user modifies the DSL in the editor (`src/editor/DslEditor.tsx`):
1. The text is captured via Monaco Editor's `onChange`.
2. A debounced call is made to the Tauri backend using `invoke('compile_dsl', { script: text })`.
3. If successful, the UI updates to show the generated Phasers or Presets.
4. If there's a syntax error, the backend returns the error line/column, which can be mapped to Monaco Editor markers (squiggly lines).

### Timeline to DSL

The Timeline mode acts as a visual generator for the DSL:
1. When blocks are arranged on the timeline, the frontend maintains a JSON representation.
2. This JSON can be serialized *back* into DSL syntax, allowing users to build a show visually, then tweak it via code.

### Updating the DSL Syntax

If you are asked to add a new command to the DSL (e.g., a new effect like `Strobe`):
1. **Rust Parser**: Update the tokenization and parsing logic in `src-tauri/src/compiler/parser.rs` to recognize the new keyword `Strobe`.
2. **Rust Engine**: Create the underlying logic in `src-tauri/src/engine/` that handles how a `Strobe` behaves over time.
3. **TypeScript Definitions**: Update any type definitions in the frontend so the Monaco editor can provide auto-complete and syntax highlighting for the new keyword.