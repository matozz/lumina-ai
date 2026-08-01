# Stage 0 Baselines

Stage 0 baselines are machine-specific characterization data, not cross-machine performance gates.

Reproduce the current artifact from the repository root:

```sh
pnpm build
LUMINA_BASELINE_COMMIT=$(git rev-parse --short HEAD) pnpm baseline:stage0
```

The release harness asserts the expected fixture output count and values, the 18-template inventory, and the current scheduler timer's 10-second drift tolerance. The drift measurement mirrors the fixed-step wait strategy without Tauri event, lock, or renderer load; Stage 1 must replace it with ManualClock determinism and loaded runtime lifecycle tests.
