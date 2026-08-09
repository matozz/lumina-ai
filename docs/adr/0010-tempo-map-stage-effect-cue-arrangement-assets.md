# ADR-0010: TempoMap 与 Stage、Effect、Cue、Arrangement 资产边界

- Status: Accepted
- Date: 2026-08-03
- Amended: 2026-08-08 for the consolidated Authoring V1 baseline
- Supersedes: ADR-0006 product-state UI and ADR-0007 audio direction

## Context

Layout topology、target-agnostic visual logic、target binding 和 musical scheduling 必须独立保存并通过精确引用连接。单体文档或隐式“最新版本”会让一个编辑静默改变其他 Cue、Arrangement 或 Live 输出。

## Decision

### Persistent ownership

- `ProjectManifest` indexes the active Stage and available Layout, Effect, Cue and Arrangement assets.
- `StageDocument` owns Patch, Fixture Groups, TargetSets and TargetingScenes, and references one Layout.
- `LayoutDefinition` owns geometry and editor capability only.
- `EffectDefinition` owns target-agnostic graph, parameter schema, capability and risk metadata.
- `CueDefinition` owns a compatible Stage and one or more Layers; each Layer binds an Effect to a Stage TargetSet.
- `ArrangementDocument` owns PPQ, TempoMap, TimeSignatureMap, CueClip tracks, typed automation and markers.
- `ProjectBundle` is an atomic transport/save container, not a monolithic ownership model.

All persisted references include stable ID and internal revision. Display names are not identity and `latest` is never a valid persisted reference.

### Targeting and compilation

- TargetSet belongs to an exact Stage topology. Arrangement CueClip references Cue only and cannot rebind TargetSet.
- compiler validates schema, references and capability in order, then resolves fixture handles, TargetSet bitsets, spatial caches, Cue routes, automation indexes, TempoMap and mixer routes.
- render evaluates the same immutable dependency closure for Authoring Preview and Live; only snapshot, transport and sink differ.

### Authoring and Live

- Authoring Preview is application/session state and writes only to PreviewSink.
- Opening a page, changing workspace, selecting assets or saving ProjectBundle cannot start playback or change Live.
- **Go Live** revalidates the selected Arrangement dependency closure, compiles an immutable snapshot and explicitly activates it. Failure leaves the current Live snapshot unchanged.

## Consequences

- Updating an Effect, Stage or Cue never silently changes an existing dependent reference.
- The UI may hide internal revisions, but validators and compiler always resolve them exactly.
- A user-selected Project folder is the durable authority: `lumina-project.json` contains the validated latest ProjectBundle and `history/` retains at most 50 validated prior versions. Writes are atomic and trailing-debounced by two seconds after ProjectBundle transactions.
- Startup is gated until a folder is available. A cached folder path is only a scoped preference; an existing latest file wins over the browser recovery shadow, while an empty folder may be initialized from that shadow or the starter.
- The app config cache stores the validated folder preference. localStorage caches only a recovery shadow and selection/session UI state. Exported asset packs remain explicit cross-project transfer artifacts.
- Full ownership and user workflows are documented in [`../authoring/project-model.md`](../authoring/project-model.md).
