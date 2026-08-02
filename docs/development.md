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
