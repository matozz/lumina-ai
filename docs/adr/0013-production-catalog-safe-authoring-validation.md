# ADR-0013: Built-in Catalog、Safe Authoring 与配置验证边界

- Status: Accepted
- Date: 2026-08-05
- Amended: 2026-08-08 for Authoring V1
- Extends: ADR-0004、ADR-0005、ADR-0010、ADR-0011、ADR-0012

## Context

随应用发布的内置内容、用户在项目中创建的内容和跨项目资产包需要明确边界。配置必须易于人工 review，同时不能绕过 Rust runtime validation 或让内置源被用户编辑覆盖。

## Decision

### Built-in assets

- Built-in Layouts, Effects, Cue recipes, Arrangements and Project Templates are separate declarative JSON files under `catalog/builtin/`.
- Build-time aggregation produces the runtime Catalog; source files remain split by asset and purpose.
- Built-ins are read-only in product UI. Customize/Duplicate creates a ProjectBundle asset with an independent ID.
- Effect remains target-agnostic. Cue recipe resolves against the selected Stage capability and produces a project Cue with exact Effect/TargetSet references.

### Safe working changes

- Effect/Cue form input updates a session-local working copy, not ProjectBundle/history.
- Schema, semantic, reference, capability and preview compile must all pass before Save.
- Failed candidates keep user input and Diagnostics while the Canvas retains last-known-good output.
- Parameters are schema-driven; no Effect ID/name branching. High-risk effects require explicit confirmation.
- Shared fixture/attribute writers require explicit MixPolicy before preview, Save or Go Live.

### Validation and Golden

- `pnpm catalog:check` validates JSON identity, references, Generator Registry, Effect parameter/graph metadata, Cue recipes, sampled output, determinism, compatibility and checked-in Goldens.
- `pnpm catalog:golden:update` is used only after reviewing intentional render/coordinate differences.
- Go Live reruns authoritative dependency validation; it never trusts a previous UI preview alone.

### User assets and Reset

- The validated ProjectBundle in the selected Project folder is the user asset source. The latest JSON is atomically replaced after a two-second edit burst, with at most 50 prior versions; localStorage is only a scoped path preference, recovery shadow and current-workspace cache.
- User asset packs support dependency-closed export, strict import validation, ID conflict detection and whole-pack rename with reference rewriting.
- Reset defaults restores the built-in starter and workspace state as a normal persisted Project change, preserving the replaced latest in history; it cannot delete Project history or downloaded asset-pack files.

## Consequences

- Developers edit built-ins only through `catalog/builtin/` and accompanying tests/Goldens.
- Users create, copy and migrate assets without mutating app defaults.
- Catalog structure and operations are documented in [`../authoring/catalog.md`](../authoring/catalog.md).
