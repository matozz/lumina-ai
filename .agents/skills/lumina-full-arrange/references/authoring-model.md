# Lumina authoring model and validation

Read this reference for every run. The current repository documents under `docs/authoring/` remain authoritative.

## Ownership and references

```text
Layout
  -> Stage (Patch, TargetSet, TargetingScene)
  -> Effect (target-agnostic visual graph)
  -> Cue Layer (Effect + TargetSet + optional scene + MixPolicy)
  -> Arrangement CueClip (Cue scheduling only)
```

- Every persisted asset reference is exact: `{ "id": string, "revision": integer }`.
- A display name and the word `latest` are not identities.
- Effect never owns a Stage, Layout, fixture, TargetSet, Cue, or Arrangement reference.
- Cue is compatible with one exact Stage. Each Layer binds one exact Effect and one TargetSet from that Stage.
- Arrangement owns PPQ, TempoMap, time signatures, length, Cue tracks, CueClips, typed automation, and markers.
- CueClip owns an exact Cue reference, integer start/duration, playback, semantic layer, and optional layer overrides. It never selects a TargetSet.

## UserAssetPack V1

A pack contains `schema_version`, pack identity/name/source project ID, and arrays of stages, layouts, effects, cues, and arrangements. It does not contain a Project manifest, active selections, Project folder, history, UI state, transport state, or Live snapshot.

The pack must carry the dependency closure it uses:

- every Stage Layout ref resolves inside `layouts`;
- every Cue Stage, Layer Effect, TargetSet, and optional TargetingScene resolves inside the pack;
- every Arrangement CueClip ref resolves inside `cues`;
- every Effect contains the standard `color` parameter using `schema.type: color`, `scope: arrangement`, and `section: main`.

### Classifying Base versus Project

Do not trust filenames. A Base Pack is the deterministic materialization of the built-in authoring starter and has all of these characteristics:

- built-in starter source identity;
- built-in Stage/Layout/Effects and starter Cues;
- the built-in `House 128` Arrangement at 128 BPM;
- no CueClips in that Arrangement;
- built-in provenance remains internally consistent.

A normal exported dependency closure is a Project Pack. It may include built-in dependencies, project-local assets, or a non-empty/project-local Arrangement. Never assume it contains unrelated project assets.

## Time and section calculations

- All authoritative musical positions are integer ticks.
- Current default PPQ is 960, but preserve the pack value.
- Beat ticks are `ppq * 4 / denominator`.
- In 4/4 at PPQ 960, one beat is 960 ticks and one bar is 3,840 ticks.
- A section `[start, end)` occupies `end - start` ticks. A Clip ending at `length_ticks` is valid.
- Tempo changes do not move Clip/keyframe ticks.
- Report occupied end as the maximum of `start_tick + duration_tick`; report the remaining range explicitly as intentional or unconfirmed.

Do not assume the first tempo or time signature applies forever. Resolve the map at each relevant boundary.

## Cue Layer identity

- Create an opaque ID shaped like `layer_<random base32-like token>`.
- Preserve the ID while editing the same Layer.
- Generate a new ID when copying a Layer or Cue, then rewrite copied automation targets atomically.
- Never show raw Layer IDs in summaries, labels, diagnostics, or questions. Say `Layer 1`, its Effect, and its TargetSet.

## Typed parameters and automation

The Effect parameter `schema` is the only type authority. Its maximum `scope` determines where it may be authored:

- `effect`: Effect only;
- `cue`: Effect and Cue Layer override;
- `arrangement`: Effect, Cue, and Arrangement automation.

Use a cue-layer Arrangement automation target only when all of these resolve:

```json
{
  "scope": "cue_layer",
  "clip_id": "readable-clip-id",
  "layer_id": "opaque-existing-layer-id",
  "parameter_id": "speed"
}
```

The target Clip must exist, its Cue must contain the Layer, and the Layer Effect must declare that parameter with `scope: arrangement`. Keyframe values must use the matching tagged type. Scalar/color values may use continuous interpolation; enum, boolean, and direction use `hold`.

Standard `color` accepts strict `#RRGGBB`. A missing Color default means “preserve Effect-authored/fallback color,” not white. `color_stops` is structural Effect-only data and is never a Cue override or Arrangement lane.

## Project-local copy rules

- IDs beginning with `builtin.` are read-only.
- Keep reused built-ins deeply equal to the input.
- A customized Effect gets a new non-built-in ID, revision appropriate to the new asset (normally 1), and `source: project_local`.
- A new/copy Cue gets a new non-built-in ID and new opaque Layer IDs; its exact Stage/Effect/TargetSet references must resolve.
- A created or modified Arrangement is delivered as a new project-local variant with a new ID. This avoids relying on an unavailable in-place Project transaction and preserves the input version.
- Copy only the dependency chain that actually changes. Keep untouched dependencies exact.

## Repository-local validation

Use the checked-in test harness, which imports the real frontend authority:

```sh
LUMINA_PACK_PATH=/absolute/path/to/output.lumina-assets.json \
  pnpm exec vitest run .agents/skills/lumina-full-arrange/evals/pack-validation.test.ts
```

The harness:

1. parses the file from disk;
2. calls `validateUserAssetPack` for current JSON Schema and dependency refs;
3. imports it into a fresh starter bundle with whole-pack conflict rename when necessary;
4. relies on `validateProjectBundle` through that import for the current semantic rules.

Also run the task-specific eval assertions when evaluating the Skill. A valid pack can still violate creative preservation or provenance requirements.
