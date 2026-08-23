# Temporal behavior audit

Read this before selecting, generating, copying, or changing the speed of any Effect. The authored `tempo` contract describes intent; only the Lumina runtime analyzer provides derived behavior evidence.

## Required loop

For each affected Effect, complete this loop:

```text
desired temporal intent
  -> choose or author parameters + EffectGraph + minimal tempo contract
  -> validate pack and exact references
  -> compile + render_at temporal analysis
  -> compare measured behavior with intent
  -> revise Effect, TargetSet, speed, Cue, or section plan
  -> repeat until the comparison passes
```

Run the analyzer before choosing among candidate Effects or speed ratios. Run it again after generating or changing an Effect, copying and rewiring a changed Effect, changing a TargetSet, or changing a speed plan. An unchanged exact built-in copied byte-for-byte may reuse an existing fingerprint only when its full cache identity is identical.

## Runtime command

Use the user-supplied Pack, never a Catalog source file or current Project folder:

```sh
pnpm effect:analyze --pack /absolute/input-or-working-pack.lumina-assets.json \
  --effect-id <exact-id> --revision <exact-revision> \
  --stage-id <stage-id> --target-set-id <target-set-id> \
  --bpm <actual-bpm> --speeds all --preview-fps 60 \
  --output /absolute/report.json \
  --contact-sheet /absolute/contact-sheet.svg --contact-speed 4
```

When Cue or Arrangement overrides matter, write the tagged values to a JSON object and pass `--parameter-overrides /absolute/overrides.json`. The cache identity must reflect exact Effect, Stage, Layout, TargetSet and resolved fixture count, seed, overrides, BPM, speeds, and sampling. Do not compare reports with different identities as though only speed changed.

The command uses the real Rust `Compiler` and `render_at`; do not replace it with JavaScript waveform math, UI screenshots, Effect names, or metadata guesses.

## Normalized 1× meaning

At 1×, Lumina defines one primary visual event per beat, while Graph cycles may differ. The Effect declares the event meaning and Graph-cycle normalization, not another per-Effect copy of the fixed 1× constant:

- pulse: one onset per beat;
- one-way wipe/chase: one complete traversal per beat;
- ping-pong: one directional traversal per beat, so a full out-and-back takes two beats;
- random/dissolve: one refresh per beat;
- breathe/continuous: one declared rise-fall, color, or movement cycle per beat;
- spatial propagation: one declared propagation event per beat.

Check `primary_events_per_beat`, `primary_events_per_second`, and `graph_cycles_per_beat`. Legal 0.25×, 0.5×, 1×, 2×, 4×, and 8× rates must be strictly increasing. In particular, 4× must measure four primary events/beat and must not collapse back to the 1× event rate.

## Metric selection

Use metrics only when they apply:

- externally supplied pulse behavior: measured `on_duty_cycle`, per-fixture flash Hz, authored numeric safety exceedance, phase/onset landmarks;
- breathe/continuous: peak count/phases, intensity mean/variance, color or movement change;
- wipe/chase/ping-pong/propagation: centroid path distance, start/end, direction reversals, active fixture fraction, TargetSet topology sensitivity;
- random/dissolve: seeded determinism, refresh/change energy, active fixture fraction, color change when present;
- every family: primary event rate, frame-delta change energy, aliasing risk.

Absence of a non-applicable optional metric is correct. Never invent a number to fill a table.

## TargetSet and topology

Analyze the exact TargetSet used by each proposed Cue. For spatial Graphs or behavior whose measured result changes with fixture selection, order, or coordinates, compare at least one materially different representative TargetSet. Confirm distinct identity/resolved fixture count and inspect trajectory, active fraction, reversals, or change energy. Do not rely on authored topology tags; a readable full-stage wipe may collapse on a tiny or one-dimensional zone.

## BPM, pulse safety, and continuity

Compute rate from the report at the Arrangement's real BPM. Catalog and Cue assets do not carry high/medium/low risk labels. When an externally supplied Effect declares pulse behavior and a numeric safety limit, inspect the maximum flash Hz across all relevant fixtures and `exceeds_authored_safety_limit`.

Do not generate a hard pulse, saw reset, hard on/off StepSequence, or FixtureMask flash. Create accents with Envelope, sine, triangle, or smoothly interpolated Random behavior so every change has a fade-in/fade-out profile. Measure intensity minimum/maximum/variance, peaks, and frame-delta energy to confirm the result remains alive at slow speeds instead of producing a long dark gap. If the input pack already contains a legacy pulse, treat its duty and Hz as analyzer evidence rather than copying it into new assets.

The authored `tempo` object intentionally has no display name or tag collection. Keep only `primary_event`, `events_per_graph_cycle`, and an applicable `safety` limit. Behavior family, 1× constant, phase landmarks, reversals, topology sensitivity, duty, recommended speed, readability, and aliasing are either product invariants, parameter/Graph facts, or derived analyzer evidence.

## High-speed readability

Treat `aliasing.risk` as an authoring decision, not merely a UI note. Inspect `frames_per_primary_event` and, for pulses, `frames_per_on_window` at the intended preview fps. For buildup/drop changes:

- prefer the lowest ratio that achieves the measured section event rate;
- do not use 4×/8× solely because the multiplier is larger;
- if caution/severe remains musically necessary, record it in the brief and use the runtime contact sheet plus slower transport scrubbing for review;
- reduce speed, increase duty/readability where safe, change TargetSet, or choose a different Effect when the primary event cannot be judged reliably.

## Comparison record

For each used Effect/TargetSet/BPM combination, keep a compact record in the transcript or an attached JSON summary:

- exact Effect name internally resolved to id/revision;
- readable Stage and TargetSet;
- parameter overrides and seed;
- used speed ratios;
- measured events/beat and events/s;
- applicable duty, peaks, trajectory/reversals, refresh/change energy, or color change;
- applicable per-fixture pulse Hz and numeric safety result;
- alias risk and the resulting arrangement decision;
- report/contact-sheet path and cache key.

If compile, validation, or the comparison fails, do not hand off that draft. Revise and run the loop again against the final written bytes.
