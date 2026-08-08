# ADR-0012: Layout Generator、Stage 应用与 Targeting 边界

- Status: Accepted
- Date: 2026-08-05
- Amended: 2026-08-08 for Authoring V1
- Extends: ADR-0002、ADR-0010、ADR-0011

## Context

Layout 几何必须可复用、可完整预览并与 Stage Patch 独立，同时保持 TargetSet、Cue 和 Arrangement 的引用安全。前端与 Rust 的容量、坐标和校验语义不能分裂。

## Decision

### Layout asset and generators

- `LayoutDefinition` is an independent asset with geometry and editor capability; it does not own Patch, TargetSet, Effect, Cue or Arrangement.
- V1 supports Matrix, Wall, Strip, Frame, Circle, Sector, Polygon, Honeycomb, Formula and Algorithm.
- Custom/Freeform preserves saved coordinates but has no editor; SVG Path preserves a read-only contract and is not sampled by the V1 authoring UI.
- `catalog/builtin/generators/registry-v1.json` describes parameter roles, capacity, coordinates, validation, editor status, defaults and preview metadata.
- TypeScript and Rust implementations must match the shared Registry and coordinate Golden.

### Quantity and spacing

- Quantity fields such as rows, columns, rings, segments and count change capacity only.
- Gap, pitch and radius change geometry only. Saved spacing is never recomputed because a quantity field changed.
- Layout preview always materializes full geometry independent of current Stage fixture count.

### Use on Stage

- **Use on Stage** is the only operation that changes Stage Layout/Patch topology.
- It derives capacity, fixtures, Patch and safe TargetSets in one validated transaction. Failure leaves bundle, history, selection and preview unchanged.
- Saving, duplicating or customizing a built-in Layout creates a project asset with an independent ID and does not change Stage until Use on Stage.
- TargetSet/TargetingScene belong to Stage; compiler precomputes membership, partition, selection and weight caches. Render never mutates topology.

## Consequences

- Stage, Lab, Cues and Arrange receive identical fixture count and coordinates for one Layout.
- Built-in presets live as separate declarative files and cover practical orientations, aspect ratios, densities and shapes.
- 20×20 quadrant/corner partition tests, small/large radial/polygon/honeycomb spacing tests and real Canvas review are release gates.
- Detailed rules are in [`../authoring/layouts.md`](../authoring/layouts.md) and [`../authoring/target-sets-and-cues.md`](../authoring/target-sets-and-cues.md).
