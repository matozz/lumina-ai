# Conversation, file, and safety boundary

Read this before asking questions, writing a pack, or handing it off.

## Conversation contract

The process is collaborative, but do not force redundant turns. Reuse facts the user already supplied and ask only for decisions that affect the result.

Before mutation, the user must be able to see:

- what the pack contains;
- what the current Arrangement actually does;
- what will remain untouched;
- the complete proposed section/energy/color/targeting plan;
- every new or copied project-local asset;
- unresolved MixPolicy or temporal safety choices.

An explicit confirmation in the initial prompt satisfies this boundary. An ambiguous “make it better” does not.

## User-facing identity

Use names, section ranges, Effect/Cue names, Layer numbers, TargetSet names, and parameter names. Keep raw revisions and opaque Layer IDs in machine data and internal validation only.

When a diagnostic depends on a Layer ID, translate it to the resolved Cue and readable Layer number. Never invent a friendly name and persist it as identity.

## File safety

- Resolve and record the exact input path before writing.
- Hash the input before and after generation.
- Refuse an output path that resolves to the input path.
- Use a new filename for every draft and local-tuning pass.
- Re-open and validate the actual written bytes.
- Do not delete invalid drafts destructively; move them outside final handoff or clearly mark them invalid.
- Do not write to Catalog, the Project folder, App storage, latest/history, or UI caches.

The output is a Project Pack for the existing Assets Import flow. It does not automatically update the currently loaded Project.

## Safe output naming

Prefer:

```text
<input-stem>-<arrangement-slug>-draft-01.lumina-assets.json
<input-stem>-<arrangement-slug>-bars-17-24-tune-02.lumina-assets.json
```

Avoid `final`, which hides iteration state, and avoid names that imply the App already imported or activated the result.

## Validation statement

Report validation as separate claims:

- UserAssetPack V1 Schema: pass/fail;
- dependency and exact refs: pass/fail;
- ProjectBundle semantic import check: pass/fail;
- runtime temporal analyzer: pass/fail, with exact report/contact-sheet paths and the BPM/TargetSet/speed identity;
- task-specific provenance/preservation/tick assertions: pass/fail;
- input hash unchanged: pass/fail.

Pack validation alone does not prove preview behavior. You may claim the objective metrics actually produced by Lumina's real compile + `render_at` temporal analyzer and show its contact sheet; do not elevate them into a claim of subjective visual quality, Go Live acceptance, autosave, or real-fixture safety. Those still require importing into Lumina and using the real Arrange/Live path.

## Missing context response

When blocked, say exactly what is missing and why it matters. Examples:

- “The Project Pack contains the Cue but not the exact Effect revision it references.”
- “The requested Arrangement is not in this dependency closure; please export a new Project Pack that includes it.”
- “The brief allows overlap but does not select a MixPolicy for shared intensity writers.”

Ask for the smallest new pack or decision needed. Do not broaden filesystem inspection to compensate.

## Handoff language

Tell the user that the output pack is additive and importable. Explain whether it creates a new Arrangement variant and which source sections it preserves. Then state the next acceptance step plainly: import through Assets, inspect the new assets, and review the specified sections in Arrange/Live.
