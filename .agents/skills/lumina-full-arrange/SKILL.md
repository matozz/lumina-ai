---
name: lumina-full-arrange
description: Create, complete, review, or section-tune an entire Lumina lighting Arrangement from a user-provided valid Base Pack or Project Pack. Use for full-show requests involving section structure, buildup/drop/breakdown/outro, energy or color arcs, multi-zone call-response, Effect/Cue review, or finishing a partial Arrangement. Do not use for a single Effect, one Cue, one automation point, Timeline UI work, Catalog/Schema maintenance, audio beat detection, or fixed-template bulk JSON generation.
---

# Lumina Full Arrange

Build a complete, intentional Lumina Arrangement through conversation. Treat the supplied UserAssetPack V1 as the auditable boundary, not as permission to inspect or mutate the running app or a Project folder.

## Read the references

Read these files before acting:

1. [authoring-model.md](references/authoring-model.md) for ownership, exact references, ticks, automation, and pack validation.
2. [effect-and-cue-review.md](references/effect-and-cue-review.md) before reporting or changing Effects and Cues.
3. [edm-arrangement-heuristics.md](references/edm-arrangement-heuristics.md) before drafting the section map or revising musical intent.
4. [communication-boundary.md](references/communication-boundary.md) before asking questions, writing files, or handing off a pack.

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
- Effects by visual role, authoring parameters, layout requirements, and risk.
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
- strobe and density risks.

Share the audit. Prefer reuse and careful tuning; propose only the smallest missing set of project-local Effects and Cues.

### 4. Complete the creative interview

Gather only information not already provided. Ask one to three high-information questions at a time:

- genre/reference mood, BPM, meter, and total bars or duration;
- section map and anchor moments;
- energy curve and how repeated drops should differ;
- primary colors and section color changes;
- buildup, drop, breakdown, fill, recovery, and outro intent;
- simultaneous zones, chase, call-response, or overlap;
- strobe permission plus venue or safety constraints;
- assets/sections that must remain unchanged;
- how much creative autonomy the user wants.

Treat approval included in the prompt (for example, “these decisions are confirmed; create it now”) as valid approval.

### 5. Produce the Arrangement brief

Before writing an output pack, show this complete proposal:

```markdown
## Arrangement brief

- Target: [new arrangement or source arrangement variant]
- Timing: [BPM, meter, PPQ, total bars/ticks]
- Preservation boundary: [what remains unchanged]

| Bars/ticks | Section | Energy | Visual role | Cue/Effect plan | Targeting | Color | Automation |
| ---------- | ------- | ------ | ----------- | --------------- | --------- | ----- | ---------- |

### Asset plan

- Reuse: [...]
- Create project-local: [...]
- Copy before editing: [...]
- MixPolicy decisions: [...]
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

- Effect is target-agnostic and contains no Stage or TargetSet reference.
- Cue Layer binds an exact Effect to an exact Stage TargetSet.
- Arrangement schedules exact Cue references only.
- CueClip must not contain `target_set_id`, `target_set_ref`, or another targeting field.
- Use integer ticks. Preserve the document PPQ and TempoMap unless the brief explicitly changes them.
- Keep `start_tick >= 0`, `duration_tick > 0`, and `start_tick + duration_tick <= length_ticks`.
- Treat CueClip intervals as half-open. Use intentional overlap only with compatible explicit MixPolicy.
- Automation target and value types must match the resolved Effect parameter. Continuous values may interpolate; direction/boolean/enum use `hold`.
- Beat-synchronized `speed` is discrete even when represented as a scalar: Cue overrides, CueClip Layer overrides, and every speed keyframe must be exactly `0.25`, `0.5`, `1`, `2`, `4`, or `8`. Do not use intermediate values such as `0.75`, `1.25`, or `1.5`; change at legal ratios instead of authoring unsupported values.
- Standard `color` may be overridden or automated as typed `#RRGGBB`. Never automate `color_stops`.
- Generate opaque Cue Layer IDs on creation, preserve them on edit, and regenerate them on copy. Do not derive them from names.
- Use stable, readable Clip/lane IDs without embedding user secrets.

### 7. Validate and hand off

1. Write a new output filename such as `<input-stem>-<arrangement-slug>-draft-01.lumina-assets.json`.
2. Run Schema, reference, exact-ref, and semantic validation against the written file.
3. Verify the input hash is unchanged.
4. Compare built-ins in the output with the same exact identities in the input; require deep equality.
5. Verify project-local provenance, Arrangement ranges, integer ticks, automation targets/types, discrete synchronized speed values, and the absence of CueClip targeting.
6. Re-open the written JSON and validate it again; do not rely on an in-memory object.
7. If validation fails, keep the invalid draft out of the final handoff, fix a new working copy, and rerun all checks.

Handoff must include:

- clickable output path;
- input type and source filename;
- Arrangement name, BPM, meter, PPQ, length, and section summary;
- created/reused project-local Effects and Cues;
- color, targeting, automation, and MixPolicy summary;
- validation results and input-integrity result;
- deliberate silence/empty regions;
- current limitation: import through Assets, then use Arrange/Live for visual and runtime acceptance.

### 8. Tune a section from feedback

When the user identifies a section:

1. Resolve its bar/tick boundary from the current output pack.
2. Restate the requested local change and preservation boundary.
3. Modify the smallest necessary copied Effect, Cue, Clip, or automation set.
4. Keep unrelated sections byte-equivalent where possible and semantically equivalent otherwise.
5. Write another newly named Project Pack; never replace the previous draft.
6. Rerun the complete validation and summarize the section diff.

## Failure behavior

Stop and ask for the smallest missing input when:

- the file is not UserAssetPack V1 or contains unknown/legacy fields;
- exact references or dependencies do not resolve;
- the target Arrangement is absent from a Project Pack;
- Stage/TargetSet compatibility cannot be proven;
- automation target/type cannot be resolved;
- a required MixPolicy or strobe decision is unconfirmed;
- the requested edit crosses an unconfirmed preservation boundary.

Do not paper over a validation failure by deleting content, inventing a dependency, or switching to a different Arrangement.
