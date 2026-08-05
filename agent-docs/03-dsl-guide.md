# Domain Specific Language (DSL) Guide

Lumina AI uses a custom JSON-based DSL to define lighting shows, phasers, and sequences. This allows for programmatic generation and precise control over the show engine.

## DSL Structure and Sections

A complete Show DSL contains several major top-level sections, each responsible for configuring different parts of the lighting engine:

### 1. `meta` (Metadata)

Defines basic information about the show.

- `name`: String, the name of the show.

### 2. `patch` (Fixture Patching)

Defines the physical lighting fixtures in the show and assigns them ID ranges.

- `type`: String, the type of fixture (`"spot"` or `"pixel"`). Spot draws as a circle, while Pixel draws as a square in the timeline canvas.
- `id_range`: Array of two integers `[start_id, end_id]`, defining the inclusive range of fixture IDs.

Example:

```json
"patch": [
  { "type": "pixel", "id_range": [1, 100] }
]
```

### 3. `layout` (Spatial Layout Generator)

Defines how fixtures are physically arranged in 2D space. The engine uses this layout for spatial effects (like sweeps and gradients).

- `type`: String, usually `"generator"`.
- `generator`: Object, defines the shape. Supported shapes:
  - `"matrix"`: Grid layout (`rows`, `columns`, `spacing`, `origin`).
  - `"circle"`: Circular layout (`rings`, `increment`, `gap`, `center`). Note: ID 1 is always placed at the center point.
  - `"formula"`: Mathematical formula for layout (`x` and `y` equations, `t_range`, `count`).
  - `"svg_path"`: Generate fixtures along an SVG path (`svg_path` string, `sample_count`).
  - `"custom"`: Manual coordinate placement (`fixtures` array with `id`, `x`, `y`).

### 4. `groups` (Fixture Grouping)

Organizes patched fixtures into logical groups for easy targeting by effects.

- `name`: String, the unique name of the group.
- `fixtures`: Defines which fixtures belong to the group. Can be:
  - An array of specific IDs: `[1, 2, 5, 8]`
  - A range: `{"range": [1, 50]}`
  - A spatial filter: `{"filter": {"spatial": {"region": "left"}}}`
- `sort_by`: (Optional) String, how the fixtures are ordered within the group (affects how Phase spread is applied). Valid values: `"none"`, `"x"`, `"-x"`, `"y"`, `"-y"`, `"distance_center"`, `"-distance_center"`, `"angle_center"`, `"random"`, `"x+y"`, `"-(x+y)"`.

### 5. `phasers` (Dynamic Effects)

Defines continuous, looped animations (Phasers) that target specific groups.

- `id`: String, unique identifier for the phaser (used by timeline to reference it).
- `name`: String, human-readable display name.
- `target`: String, the name of the Group this phaser applies to.
- `multiplier`: (Optional) beat-synchronized speed ratio relative to the global tempo. Accepted values are `0.25`, `0.5`, `1`, `2`, `4`, and `8` (default: `1`).
- `steps`: Array of step objects defining the keyframes of the loop.
  - `values`: Object containing target parameters (e.g., `{"dimmer": 1.0, "color": "#ff0000"}`).
  - `width`: (Optional) Float, the percentage of the phase this step occupies (default: 100).
  - `transition`: (Optional) Float, crossfade percentage to the next step (0 = snap, 100 = smooth fade).
  - `accel` / `decel`: (Optional) Integer, acceleration/deceleration curves.
- `phase`: Object, defines how the effect spreads across multiple fixtures.
  - `mode`: `"spread"` (distributed evenly) or `"grouped"` (distributed in chunks).
  - `spread`: Object with `{"from": 0.0, "to": 100}` (percentage).

### 6. `timeline` (Show Sequencing)

Defines the sequence of events and animations over time.

- `events`: Array of timeline blocks.
  - `beat`: Float, start time in beats.
  - `duration`: (Optional) Float, length in beats.
  - `action`: Object defining what happens. Types include:
    - `"phaser"`: Triggers a phaser (requires `"phaser": "phaser_id"`).
    - `"animate"`: Executes keyframe animations on specific properties.

## DSL Architecture

The DSL is written as JSON in the frontend's Monaco Editor and is parsed/executed by the Rust backend.

### Key Components

1. **JSON Parser / Deserializer (`src-tauri/src/compiler/mod.rs`)**:
   - Reads the JSON string payload.
   - Uses `serde_json` to map JSON fields to internal Rust engine structures (e.g., `Phaser`, `Timeline`).
2. **Execution Engine (`src-tauri/src/engine/`)**:
   - Takes the compiled structures and schedules them for output.

## How to Drive the DSL

### From the Frontend

When a user modifies the DSL in the editor (`src/editor/DslEditor.tsx`):

1. The text is captured via Monaco Editor's `onChange`.
2. A debounced call is made to the Tauri backend using `invoke('compile_dsl', { script: text })`.
3. If successful, the UI updates to show the generated Phasers.
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

- `multiplier`: A beat-synchronized ratio that multiplies the global BPM. Authoring surfaces and command validation accept only `0.25`, `0.5`, `1`, `2`, `4`, and `8`.
  - `1.0`: The phaser completes exactly one full cycle (360 degrees) per beat.
  - `2.0`: Double speed (two cycles per beat).
  - `0.5`: Half speed (one cycle every two beats).
  - Default is `1.0` if omitted.

Example of a Phaser:

```json
{
  "id": "hard_chase",
  "name": "Hard Chase",
  "target": "Circle",
  "multiplier": 2.0,
  "steps": [
    { "values": { "dimmer": 1.0, "color": "#ffffff" }, "width": 10, "transition": 0 },
    { "values": { "dimmer": 0.0 }, "width": 90, "transition": 0 }
  ],
  "phase": { "mode": "spread", "spread": { "from": 0, "to": 100 } }
}
```

Note: Layout information (like `circle` or `matrix`) is now defined globally in the `layout` and `groups` sections of the DSL, rather than directly inside individual phasers.

## Guidelines for Generating Visually Striking DSL Effects

When tasked with generating or modifying DSL effects, follow these core principles to ensure the results are visually meaningful, dynamic, and strictly synchronized with the show's rhythm. Avoid chaotic, meaningless, or "robot-like" movements at all costs.

### 1. Rhythmic Synchronization (Tight to the Beat)

- **Intentional Movement**: Every Phaser action (Pan/Tilt movement, Dimmer flashing) must have a clear visual purpose and direction. **Never** generate random, meaningless shaking (e.g., constant bouncing without dimming).
- **Orderly Execution**: Choose between sharp, synchronized hits across all fixtures, or use `spread` (e.g., `from: 0, to: 360`) to make the effect roll through the array like an organized wave.

### 2. Timeline and Keyframe Animations

- **Timeline Integration**: You can schedule `phaser` triggers or continuous `animate` tracks in the `timeline` section. **Note**: When targeting a phaser via the timeline (either to start it or animate its properties), always use the phaser's **`id`**, not its display `name`.
- **Keyframe Interpolation**: Use `{"type": "animate", "target": "phaser:id_here.color", "keyframes": [...]}` to drive parameter changes over time. Keyframes support `Float` and `Color` (#RRGGBB) values, and various `easing` curves (`linear`, `ease_in_out`, etc.).

### 3. Utilizing Spatial Layouts

- **Embrace the Array**: When using layouts like `matrix` or complex shapes like `lissajous`, avoid keeping all fixtures at `dimmer: 1.0` constantly. Use tight `width` values (e.g., `width: 10` for on, `width: 90` for off) paired with `spread` to create radar sweeps, ripples, or moving trails.
- **Avoid Visual Clutter**: Pushing too many static colors across an array (like a flat rainbow) looks chaotic and low-resolution. Always pair color sweeps with a Dimmer wave to give it breathing room and shape.

### 3. Clean and Intentional Transitions

- **Don't Mix High-Frequency Chaos**: Do not combine hyper-fast strobing, rapid color changing, and wide Pan/Tilt swings in the same fixture group. It creates a visual disaster.
- **Purposeful Transitions**:
  - For organic pulses/breathing: Use `transition: 100` with distinct `accel/decel` curves.
  - For sharp chases/strobes: Use `transition: 0` for crisp, punchy cuts.

### 4. Layering & Multipliers

- **Combine Multiple Phasers**: The best templates use 2-3 overlapping phasers targeting different parameters (e.g., one phaser driving `pan/tilt` movement, while another drives a `dimmer` chase on top of it).
- **Vary Multipliers**: Give different phasers slightly different `multiplier` values (e.g., `1.0` for movement, `2.0` for dimmer) to create complex, evolving polyrhythms instead of static loops.

### 5. Proper Data Pairing (Dimmer + Color)

- **Always Pair Dimmer with Color for RGB Fixtures**: The rendering engine defaults unknown RGB color values to black (`#000000`). If you define a step like `{ "dimmer": 1.0 }` without a corresponding `color`, the fixture will technically be "on" but rendering black, making it invisible on the canvas. Always provide a default color (e.g., `"color": "#ffffff"`) when raising the dimmer on RGB patches.

### 6. Circle Layout Quirks (The +1 Rule)

- **Center Point Consumption**: When using the `circle` layout generator, the engine _always_ places the very first fixture (e.g., ID 1) exactly at the center coordinate. The actual ring generation starts from the second fixture.
- **How to Fix**: If you want a perfect ring of 16 fixtures (`increment: 16`), you MUST define your patch range as `[1, 17]` (total 17 fixtures). ID 1 goes to the center, and IDs 2-17 perfectly close the 16-point circle. Failing to add this `+1` will result in a circle with a permanent missing gap.
