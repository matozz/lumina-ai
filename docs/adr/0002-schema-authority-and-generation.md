# ADR-0002: Schema 权威来源与代码生成链

- Status: Accepted
- Date: 2026-08-02
- Amended: 2026-08-08 for the consolidated V1 baseline

## Context

Rust、前端 runtime validation、checked-in JSON Schema 与 TypeScript 必须描述同一份 Project/Show 语义。当前产品仍处于内部开发期，本次收敛选择一次性建立新的 V1，而不承担早期开发格式兼容。

## Decision

- Rust document types 是所有活跃 contract 的语义权威。
- ProjectBundle、Manifest、Stage、Layout、Effect、Cue、Arrangement、Show runtime document、Production Catalog、Cue Recipe 与 User Asset Pack 都使用当前 `schema_version: 1`。
- Loader 只接受当前 V1。缺失版本、其他版本和 unknown fields fail closed；同版本非法内容不执行隐式修复。
- JSON Schema 由 `schemars` 生成到 `schemas/*-v1.*`，TypeScript 生成到 `src/generated/*-v1.ts`，并纳入版本控制。
- `pnpm schema:generate` 更新 artifacts，`pnpm schema:check` 检测 drift。前端 runtime validator 读取生成 Schema，不维护另一棵不等价的文档 schema。
- Document、validated model 与 compiled runtime IR 保持不同层级。UI/IPC 不直接复用 runtime IR。
- schema validation 先于 reference validation，reference validation 先于 capability、geometry、graph 和 compile。
- `schema_version` 与内部 asset revision 不在普通 UI 展示。

## Consequences

- 本次内部基线不包含旧版本 loader、migration、recovery branch、generated types 或 compatibility fixture。
- scoped localStorage version mismatch 只重建对应的开发缓存，禁止 origin-wide 清理。
- 正式发布后的任何不兼容升级必须重新引入显式 migration、loss report、contract tests 与回滚设计。
- contract 变更必须同时提交 Rust、generated artifacts、runtime tests 和必要的 Catalog Golden。
