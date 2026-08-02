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
- Semantic validator 在 compiler 前验证全部 ID、引用、范围、颜色、phase、formula 和 layout 约束；compile 后的 group/effect/automation 引用使用 typed handle，runtime 不再重建或解析自由字符串路径。
- `schemas/show-capabilities-v1.json` 与 JSON Schema/TypeScript 同属生成链并接受 `schema:check`；AI、UI 和 tooling 读取同一份可枚举能力元数据。
- V0 migration 可以补齐 stable group ID 和 structured automation target；声明为当前版本但不符合当前 schema 的文档 fail closed，不执行同版本“修复”。用户保存和 migration CLI 使用同目录临时文件替换，避免部分写入。

## Alternatives considered

1. 以 Zod 为权威并生成 Rust：Rust 的 enum、数值语义和 compiler 演进仍需第二套约束，且会把运行时实现迁就前端工具。
2. 手写 JSON Schema 并分别维护 Rust/TypeScript：review 成本低但无法机械证明同步，延续 R-002。
3. Runtime 宽松读取未知新版本：可能静默丢失 AI/用户字段，无法安全回写。

## Consequences

- 所有模板和保存文件必须带 `schema_version`；legacy 文档加载后保存为当前版本。
- 增删 document 字段需要先改 Rust types，再运行生成命令，并提交 artifacts、migration 和 contract tests。
- 严格解析会把过去被忽略的字段变成结构化 Diagnostic；这是有意的兼容性收紧。
- `schemars` 仅参与 document/schema tooling，不进入实时 render path。
- SVG path 在当前 compiler 尚无 sampler；它会返回稳定 `DOC_SVG_PATH_INVALID`，不得回落为其他曲线。

## Migration and rollback

迁移按版本逐步执行，当前只提供 legacy V0→V1。每次 migration 保留 source version、target version 和 change list。回滚 Stage 2 切片时可回退生成 artifacts、document module 和依赖；不得保留一个会宽松读取未知版本的旁路入口。

## Related commits

- Stage 0/1 baseline: `7fc1edc`
- Versioned document and generation chain: `0ce3cbb`
- Strict semantic contract and typed references: 本切片提交
