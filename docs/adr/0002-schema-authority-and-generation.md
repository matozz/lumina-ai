# ADR-0002: Schema 权威来源与代码生成链

- Status: Accepted
- Date: 2026-08-02
- Related Stage: Stage 2

## Context

当前 Rust `ShowDSL` 与前端手写 Zod schema 已经漂移：Rust 接受未知字段，phase 的 mode 与 payload 可不匹配，前端会剥离自己不认识的字段，模板和保存文件也没有版本。人、UI、AI 和 Runtime 因而无法共享一份可演进契约。

Stage 2 要求版本化 `ShowDocument`、严格 migration、Rust/JSON Schema/TypeScript 一致性，以及 CI 可验证的 checked-in artifacts。运行时 IR 仍需与用户文档分离。

## Decision

- Rust `ShowDocumentV1` 是文档语义权威；所有用户输入只能经 `load_document` 的版本识别、migration 和严格反序列化进入后续 validator/compiler。
- 顶层 `schema_version` 是必需字段。当前版本为整数 `1`；无版本的 legacy DSL 通过显式 V0→V1 migration 加入该字段，并产生 `MigrationReport`。未知新版本 fail closed。
- Document structs 默认 `deny_unknown_fields`。JSON Schema 由 `schemars` 从这些 Rust types 生成到 `schemas/show-document-v1.schema.json`，artifact 纳入版本控制。
- TypeScript document types 和前端 runtime validator 以生成的 JSON Schema 为输入，不再维护独立 Zod document tree。生成/校验命令必须同时检查 Rust schema、TypeScript types、模板和 Monaco schema 配置。
- `ShowDocumentV1`、`ValidatedShow` 和 `CompiledShow` 保持独立层级；前端只能使用 document contract 和 IPC payload，不直接复用 Runtime IR。

## Alternatives considered

1. 以 Zod 为权威并生成 Rust：Rust 的 enum、数值语义和 compiler 演进仍需第二套约束，且会把运行时实现迁就前端工具。
2. 手写 JSON Schema 并分别维护 Rust/TypeScript：review 成本低但无法机械证明同步，延续 R-002。
3. Runtime 宽松读取未知新版本：可能静默丢失 AI/用户字段，无法安全回写。

## Consequences

- 所有模板和保存文件必须带 `schema_version`；legacy 文档加载后保存为当前版本。
- 增删 document 字段需要先改 Rust types，再运行生成命令，并提交 artifacts、migration 和 contract tests。
- 严格解析会把过去被忽略的字段变成结构化 Diagnostic；这是有意的兼容性收紧。
- `schemars` 仅参与 document/schema tooling，不进入实时 render path。

## Migration and rollback

迁移按版本逐步执行，当前只提供 legacy V0→V1。每次 migration 保留 source version、target version 和 change list。回滚 Stage 2 切片时可回退生成 artifacts、document module 和依赖；不得保留一个会宽松读取未知版本的旁路入口。

## Related commits

- Stage 0/1 baseline: `7fc1edc`
- Versioned document and generation chain: 本切片提交
