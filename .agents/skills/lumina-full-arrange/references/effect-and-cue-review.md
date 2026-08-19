# Effect and Cue review

Read this after the pack validates and before proposing the Arrangement.

## Effect inventory

For each Effect, report readable facts from its document:

| Field                              | Review question                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Family/category                    | Is this primarily intensity, color, movement, spatial, strobe, or utility?                                     |
| Graph/output                       | What visible attribute and motion does it actually produce?                                                    |
| Authored tempo behavior            | What is the declared primary event, 1× anchor, events/Graph cycle, duty/reversal/topology intent?              |
| Runtime temporal fingerprint       | On the actual TargetSet/BPM, what are measured events/s, duty/trajectory/change energy, safety and alias risk? |
| Energy/density/motion/colorfulness | Which section role fits it?                                                                                    |
| Required attributes                | Does the Stage profile provide them?                                                                           |
| Layout capabilities                | Does it require coordinates, matrix topology, radial order, or a sufficiently large TargetSet?                 |
| Parameters                         | Which are Effect-only, Cue-overridable, or Arrangement-automatable?                                            |
| Standard Color                     | Does it have a default, preserve authored Palette, or act as an explicit override only?                        |
| Strobe risk                        | Is explicit user confirmation or a venue limitation required?                                                  |

Do not infer behavior only from the Effect name, motion tag, legal speed, oscillator waveform, or raw Graph cycle. Inspect the authored tempo contract, graph, Catalog metadata, parameter help, capabilities, and risk, then use the real runtime analyzer as required by [temporal-behavior.md](temporal-behavior.md).

## Visual role map

Assign useful roles rather than ranking Effects globally:

- **Foundation**: stable, low-density, long-hold behavior that leaves headroom.
- **Lift/buildup**: parameters that can increase speed, intensity, density, or spatial reach over time.
- **Drop body**: legible full-stage or zoned motion with enough persistence to read.
- **Accent/fill**: short bursts, flashes, or directional changes used sparingly.
- **Breakdown/recovery**: lower motion/density with controlled color and breathing space.
- **Outro**: simplifying or dimming behavior that creates a deliberate finish.

Mark near-duplicates when two Effects share graph shape, output attributes, and visible role with only small parameter differences. Reuse one and tune it unless the difference supports the section story.

## Layout and TargetSet suitability

- Spatial/matrix Effects may collapse on very small or one-dimensional TargetSets.
- A full-stage synchronized Effect can obscure zone dialogue if layered over it at equal priority.
- Center/Edges and quadrant call-response should remain visibly separated long enough to read.
- TargetingScenes can express ordered selection without baking target identity into an Effect.
- Verify selector size and topology from the Stage/Layout; do not guess from TargetSet names.

## Cue review

For each Cue, list readable Layer numbers with:

- Effect and TargetSet names;
- parameter overrides and whether they stay in range;
- optional TargetingScene;
- authored phase/seed/priority/trigger policy;
- attributes written by each Layer;
- explicit MixPolicy for intersections.

Use the Cue as the unit of simultaneous multi-zone composition. Use separate Cues and CueClips when zones act at different times.

## MixPolicy review

Multiple active writers on the same fixture attribute need a deliberate policy. Never assume time overlap alone selects the right mix.

- `HTP`: brightest/highest contribution wins; often reasonable for intensity competition.
- `LTP`: stable latest/priority ordering wins; often useful for color or positional ownership.
- `Add`: intentional accumulation with clamp; never enable automatically.
- `Multiply`: intentional modulation/masking relationship; never enable automatically.
- `Mask`: intentional gated output; never enable automatically.

Record policy per affected attribute and Layer/Clip relationship. If the intention is unclear, redesign the overlap or ask the user.

## Color review

- The standard `color` parameter is the shared typed override path in Effect, Cue, and Arrangement.
- If `color.schema.default` is absent, clearing the override restores the graph-authored Palette or no color writer.
- A UI color picker's temporary white is not an authored default.
- `color_stops` defines structural Palette stops only at Effect scope.
- Prefer a coherent section palette and purposeful transition over per-Clip random color changes.

## Minimal asset decision

Before creating assets, answer:

1. Can an existing Effect and Cue express the role by legal parameter override/automation?
2. Can a new project-local Cue bind an existing Effect to the required TargetSet?
3. Is an Effect copy truly needed because graph- or Effect-scope behavior must change?

Choose the first sufficient option. Explain every new project-local asset in the brief.
