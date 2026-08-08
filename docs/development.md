# Development Toolchain and Checks

Lumina pins its quality-gate toolchain so local and CI results are reproducible:

- Node.js 22.20.0 via `.nvmrc`
- pnpm 10.33.0 via `packageManager`
- Rust 1.94.1 with rustfmt and Clippy via `rust-toolchain.toml`

Install JavaScript dependencies with `pnpm install --frozen-lockfile`. Rustup automatically selects the pinned Rust toolchain in this repository.

Run the local gates from the repository root:

```sh
pnpm check
pnpm check:rust
```

`pnpm check` runs Prettier verification, TypeScript, Vitest, and the Vite production build. `pnpm check:rust` runs rustfmt verification, strict Clippy across all targets, and all Rust tests. `pnpm check:all` runs both groups in the same order as CI.

Authoring contract and Catalog changes also use:

```sh
pnpm schema:generate        # regenerate checked-in V1 JSON Schema and TypeScript
pnpm schema:check           # fail on generated-contract drift
pnpm catalog:check          # validate built-ins and compare checked-in Goldens
pnpm catalog:golden:update  # update reviewed Catalog/Generator Golden output
```

The current architecture, ownership rules and visual acceptance checklist are in [`authoring/README.md`](authoring/README.md). User-facing changes must be exercised in the Tauri app at 1100×720 and a common larger window; opening a page, changing workspace or selecting an asset must not start playback.
