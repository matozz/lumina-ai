---
name: lumina-full-arrange
description: Create, complete, review, or section-tune an entire Lumina lighting Arrangement from a user-provided valid Base Pack or Project Pack. Use for full-show requests involving genre-aware phrase/form planning, section structure, buildup/drop/breakdown/outro, energy or color arcs, multi-zone call-response, Effect/Cue review, or finishing a partial Arrangement. Do not use for a single Effect, one Cue, one automation point, Timeline UI work, Catalog/Schema maintenance, audio beat detection, or fixed-template bulk JSON generation.
---

# Lumina Full Arrange

Build a complete, intentional Lumina Arrangement through conversation. Treat the supplied UserAssetPack V1 as the auditable boundary, not as permission to inspect or mutate the running app or a Project folder.

## Read the references

Read these files before acting:

1. [authoring-model.md](references/authoring-model.md) for ownership, exact references, ticks, automation, and pack validation.
2. [effect-and-cue-review.md](references/effect-and-cue-review.md) before reporting or changing Effects and Cues.
3. [temporal-behavior.md](references/temporal-behavior.md) before selecting, generating, copying, or changing the speed of any Effect.
4. [edm-form-patterns.md](references/edm-form-patterns.md) before interpreting a genre, a section window, or unspecified phrase/pattern lengths.
5. [edm-arrangement-heuristics.md](references/edm-arrangement-heuristics.md) before drafting section energy or revising musical intent.
6. [communication-boundary.md](references/communication-boundary.md) before asking questions, writing files, or handing off a pack.

The repository's current `docs/authoring/README.md` and linked authoring documents outrank this Skill if the contract changes.

## Non-negotiable boundary

- Start only from a UserAssetPack V1 file that the user explicitly supplied in this conversation.
- Stop if there is no valid input pack. Do not infer assets from the app, a Project folder, UI text, caches, source Catalog files, or prior conversations.
- Never treat a Project Pack as a Project manifest or complete Project snapshot.
- Never read or write `lumina-project.json`, `history/`, localStorage, WebView SQLite, or the current app Project.
- Never overwrite the input file. Write a newly named `.lumina-assets.json` file in a user-approved output location or beside eval outputs.
- Keep built-ins byte-for-byte unchanged. Copy any built-in that needs editing to a new project-local asset first.
- Do not silently fill an empty tail or rewrite unconfirmed sections.
- Do not expose raw Cue Layer IDs or asset revisions in ordinary user-facing prose.

If the user supplies both Base and Project Packs, ask which Project Pack is the modification target. Use the Base Pack only as read-only built-in capability context.

## Workflow state machine

Complete each gate in order. A user may provide the creative answers and approval in the initial request; do not ask again when they are already explicit.

### 1. Validate and classify the pack

1. Parse the JSON without changing it and record a hash of the input file.
2. Run JSON Schema validation, pack reference validation, exact-reference checks, and the available Lumina semantic validation. In this repository, use the existing `validateUserAssetPack` authority through the local test harness described in [authoring-model.md](references/authoring-model.md).
3. Report every diagnostic with an understandable asset path. Stop on any error.
4. Classify by content and provenance, never by filename alone:
   - **Base Pack**: the deterministic built-in starter closure: built-in Stage/Layout/Effects, no pre-authored Cues, and an empty built-in `House 128`.
   - **Project Pack**: any valid ordinary asset dependency closure exported from a project, including project-local or non-empty Arrangement content.
5. If a Project Pack lacks the requested Arrangement or any dependency, report what is missing and request a new Project Pack.

### 2. Report the available authoring context

Present a compact inventory before creative work:

- Pack type, pack name, and intended use.
- Stage and Layout names, fixture capacity, TargetSets, and TargetingScenes.
- Effects by visual role, authoring parameters, and layout requirements.
- Authored tempo behavior plus runtime-measured default/1× event rate, duty or trajectory where applicable, using the actual Stage, TargetSet, seed, overrides, and BPM.
- Cues by readable Layer number, Effect, TargetSet, overrides, and MixPolicy.
- Arrangements by name, actual BPM, meter, PPQ, total bars/ticks, Clip count, automation count, occupied range, and empty regions.
- Missing references, compatibility concerns, or same-attribute overlap risks.

Call out contradictions such as `House 128 Custom` running at 132 BPM. Derive facts from the supplied pack every time.

### 3. Audit Effects and Cues

Use [effect-and-cue-review.md](references/effect-and-cue-review.md) to determine:

- what each asset visibly contributes;
- near-duplicates and missing roles;
- layout/TargetSet suitability;
- useful cue- or arrangement-scope parameters;
- standard Color authored/default/fallback behavior;
- Effect-only `color_stops` limitations;
- shared-attribute writers that need explicit MixPolicy;
- density, temporal readability, and any applicable numeric safety constraints.

Use [temporal-behavior.md](references/temporal-behavior.md) to run or consume the real runtime analyzer before choosing candidate Effects. Do not infer final event rate from Effect names, motion tags, legal speed ratios, oscillator waveform, or raw Graph cycles. For topology-sensitive candidates, analyze the TargetSets actually proposed in the brief.

Share the audit. Prefer reuse and careful tuning; propose only the smallest missing set of project-local Effects and Cues.

### 4. Complete the creative interview

Gather only information not already provided. Ask one to three high-information questions at a time:

- genre/subtype or reference form, BPM, meter, and total bars or duration;
- section map, absolute bar anchors, requested start/end section, and whether proposed profile defaults are acceptable;
- energy curve and how repeated drops should differ;
- primary colors and section color changes;
- buildup, drop, breakdown, fill, recovery, and outro intent;
- simultaneous zones, chase, call-response, or overlap;
- accent persistence, hard-flash restrictions, and venue constraints;
- assets/sections that must remain unchanged;
- how much creative autonomy the user wants.

Treat approval included in the prompt (for example, “these decisions are confirmed; create it now”) as valid approval.

### 5. Produce the Arrangement brief

Before writing an output pack, show this complete proposal:

```markdown
## Arrangement brief

- Target: [new arrangement or source arrangement variant]
- Timing: [BPM, meter, PPQ, total bars/ticks]
- Form basis: [user anchors, existing Arrangement, or proposed profile default]
- Phrase model: [profile, phrase quantum, exact section lengths, and pattern cycles]
- Preservation boundary: [what remains unchanged]

| Bars/ticks | Section | Section/pattern length | Energy | Visual role | Cue/Effect plan | Targeting | Color | Automation |
| ---------- | ------- | ---------------------- | ------ | ----------- | --------------- | --------- | ----- | ---------- |

### Asset plan

- Reuse: [...]
- Create project-local: [...]
- Copy before editing: [...]
- MixPolicy decisions: [...]
- Measured temporal plan: [Effect/TargetSet/BPM, primary event rate, readable ratios, continuity/trajectory, applicable numeric safety, and aliasing decisions]
- Intentional silence/blackout: [...]
```

Resolve contradictory or unsafe choices. Do not create or edit assets until the user confirms the brief, unless their original request already explicitly confirms the same decisions.

### 6. Build a new Project Pack

Create a dependency-closed UserAssetPack V1 variant without changing the input file.

#### Base Pack creation

- Preserve every referenced built-in object exactly.
- Create new, non-`builtin.*` IDs for the Arrangement and every new or customized asset.
- Set new/customized Effect `source` to `project_local`.
- Use built-in Effects as exact, read-only dependencies when no customization is needed.
- Create the smallest necessary project-local Cues for every Effect/TargetSet binding; Base Packs intentionally contain no example Cues to reuse as creative references.
- Create a project-local Arrangement rather than editing built-in `House 128`.

#### Project Pack modification

- Derive BPM, meter, length, occupied range, empty tail, Clips, and automation from the pack, not its names or historical samples.
- Preserve every unconfirmed section and dependency.
- Because current asset-pack import is migration-oriented rather than an in-place update transaction, create a new project-local variant ID/name for changed Effects, Cues, and the target Arrangement. Rewire only the copied dependency chain.
- Keep untouched project-local dependencies exact and unchanged.
- Retain intentional empty regions. Fill only the confirmed range.

#### Authoring rules

- When genre or section-window defaults affect timing, apply the evidence precedence in [edm-form-patterns.md](references/edm-form-patterns.md). Explicit user anchors and actual Arrangement boundaries outrank every profile prior.
- Resolve ambiguous section ordinals before calculating. Then use `scripts/derive-form-window.mjs` to calculate the supported named window. Record whether the result is a proposed profile default or an exact fit to a user endpoint; never present it as detected audio structure.
- Keep section length, phrase quantum, and internal visual pattern cycle distinct. Pattern cycles should divide their section unless a confirmed source boundary authorizes an asymmetric phrase.
- Effect is target-agnostic and contains no Stage or TargetSet reference.
- Cue Layer binds an exact Effect to an exact Stage TargetSet.
- Arrangement schedules exact Cue references only.
- CueClip must not contain `target_set_id`, `target_set_ref`, or another targeting field.
- Use integer ticks. Preserve the document PPQ and TempoMap unless the brief explicitly changes them.
- Keep `start_tick >= 0`, `duration_tick > 0`, and `start_tick + duration_tick <= length_ticks`.
- Treat CueClip intervals as half-open. Use intentional overlap only with compatible explicit MixPolicy.
- Automation target and value types must match the resolved Effect parameter. Continuous values may interpolate; direction/boolean/enum use `hold`.
- Beat-synchronized `speed` is discrete even when represented as a scalar: Cue overrides, CueClip Layer overrides, and every speed keyframe must be exactly `0.25`, `0.5`, `1`, `2`, `4`, or `8`. Do not use intermediate values such as `0.75`, `1.25`, or `1.5`; change at legal ratios instead of authoring unsupported values.
- A legal ratio is not automatically readable or safe. Before selecting a ratio, use the actual Arrangement BPM and TargetSet to compare measured `primary_events_per_second`, spatial path/reversals, intensity persistence/change energy, applicable pulse Hz, and preview aliasing. Buildup/drop speed changes must follow this evidence, not a larger multiplier by itself.
- Every new or copied Effect must retain the minimal authored `tempo` contract: `primary_event`, `events_per_graph_cycle`, and `safety` only when a real numeric limit applies. New Effects must use continuous Envelope, sine, triangle, or smoothly interpolated Random behavior; do not generate Pulse/Saw oscillators, hard on/off StepSequences, or FixtureMask flashes. Keep fade-shape parameters in typed parameters and their Graph bindings; do not duplicate duty, behavior kind, phase landmarks, topology tags, recommended ranges, or runtime fingerprints into `tempo`.
- Standard `color` may be overridden or automated as typed `#RRGGBB`. Never automate `color_stops`.
- Generate opaque Cue Layer IDs on creation, preserve them on edit, and regenerate them on copy. Do not derive them from names.
- Give every Cue Layer a stable lowercase 16-character hexadecimal `seed`. Friendly labels, UUIDs, and arbitrary strings pass JSON shape checks but fail the Rust preview compiler.
- Use stable, readable Clip/lane IDs without embedding user secrets.

### 7. Validate and hand off

1. Write a new output filename such as `<input-stem>-<arrangement-slug>-draft-01.lumina-assets.json`.
2. Run Schema, reference, exact-ref, and semantic validation against the written file.
3. Verify the input hash is unchanged.
4. Compare built-ins in the output with the same exact identities in the input; require deep equality.
5. Verify project-local provenance, Arrangement ranges, integer ticks, automation targets/types, discrete synchronized speed values, 16-hex Cue Layer seeds, and the absence of CueClip targeting.
6. Run the real temporal analyzer on every selected Effect/TargetSet/BPM/speed combination that affects the Arrangement. Re-run it after generating or changing an Effect and after changing speed decisions. Compare the measured report to the brief; revise the Graph, Cue override, speed step, TargetSet, or section plan until primary event rate, readability, topology, duty, and safety agree.
7. When a form model was used, verify contiguous section boundaries, the exact requested endpoint, bar-to-tick conversion, pattern-cycle divisibility, and that major Clip/automation changes land on the intended phrase boundary.
8. Re-open the written JSON and validate it again; do not rely on an in-memory object. Re-run the analyzer against those written bytes so the final fingerprint identity matches the handoff pack.
9. If validation or temporal comparison fails, keep the invalid draft out of the final handoff, fix a new working copy, and rerun all checks.

Handoff must include:

- clickable output path;
- input type and source filename;
- Arrangement name, BPM, meter, PPQ, length, and section summary;
- created/reused project-local Effects and Cues;
- color, targeting, automation, and MixPolicy summary;
- validation results and input-integrity result;
- runtime temporal audit summary and artifact paths, including measured rates, relevant continuity/trajectory/topology, applicable real-BPM pulse Hz, and high-speed alias/readability decisions;
- deliberate silence/empty regions;
- current limitation: import through Assets, then use Arrange/Live for visual and runtime acceptance.

### 8. Tune a section from feedback

When the user identifies a section:

1. Resolve its bar/tick boundary from the current output pack.
2. Restate the requested local change and preservation boundary.
3. Modify the smallest necessary copied Effect, Cue, Clip, or automation set.
4. Keep unrelated sections byte-equivalent where possible and semantically equivalent otherwise.
5. Re-run temporal analysis for every changed Effect, TargetSet, BPM, or speed step; compare it to the local intent before accepting the tune.
6. Write another newly named Project Pack; never replace the previous draft.
7. Rerun the complete validation and summarize the section diff.

## Failure behavior

Stop and ask for the smallest missing input when:

- the file is not UserAssetPack V1 or contains unknown/legacy fields;
- exact references or dependencies do not resolve;
- the target Arrangement is absent from a Project Pack;
- Stage/TargetSet compatibility cannot be proven;
- automation target/type cannot be resolved;
- exact synchronization to a real track is requested but no usable section/bar anchors are supplied;
- a requested start/end window has no exact phrase-aligned fit and the user has not authorized an asymmetric section;
- a required MixPolicy or temporal safety decision is unconfirmed;
- the runtime temporal analyzer cannot compile the exact Effect/Stage/Layout/TargetSet identity, or measured behavior contradicts the brief and cannot be revised safely;
- the requested edit crosses an unconfirmed preservation boundary.

Do not paper over a validation failure by deleting content, inventing a dependency, or switching to a different Arrangement.
