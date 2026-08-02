# Stage 0 Baselines

Stage 0 baselines are machine-specific characterization data, not cross-machine performance gates.

Reproduce the current artifact from the repository root:

```sh
pnpm build
LUMINA_BASELINE_COMMIT=$(git rev-parse --short HEAD) pnpm baseline:stage0
```

The release harness asserts the expected fixture output count and values, the 18-template inventory, and the current scheduler timer's 10-second drift tolerance. The drift measurement mirrors the fixed-step wait strategy without Tauri event, lock, or renderer load; Stage 1 must replace it with ManualClock determinism and loaded runtime lifecycle tests.

## Stage 1 loaded runtime validation

Reproduce the Stage 1 artifact from the repository root:

```sh
LUMINA_BASELINE_COMMIT=$(git rev-parse --short HEAD) pnpm baseline:stage1
```

The release harness advances a ManualClock through 10 logical minutes at 60Hz while rendering and publishing 500 fixtures on every tick. It asserts drift stays within 0.1ms, validates 36,000 monotonic Frame sequences, and records renderer/publisher throughput. The checked-in `c73a54a` macOS arm64 run evaluated 18,000,000 fixture frames in 4.042 seconds (148.44× realtime), with 0.012ms logical drift. Scheduler lifecycle tests separately exercise real 30/60/120Hz timers and concurrent reload/transport/resync locking.
