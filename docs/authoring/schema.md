# Schema V1

## 当前基线

当前内部开发基线只接受新的 V1。Project、Manifest、Stage、Layout、Effect、Cue、Arrangement、Show runtime document、Production Catalog、Cue Recipe 和 User Asset Pack 都保留内部 `schema_version: 1`，但普通 UI 不显示版本。

这个 V1 以当前领域模型为内容基础，不是早期数据结构的恢复。旧格式、迁移器、恢复分支、生成类型、Schema 和 fixtures 不属于运行时或测试矩阵；声明为其他版本、缺少版本或含未知字段的输入 fail closed。

不提供旧格式 runtime compatibility 不等于保留仓库内旧配置。每次内部 breaking contract 变更都必须同步迁移受源码管理的 Catalog Effect、Cue/Arrangement 参数引用、starter template、fixtures 和 Golden；全库不能同时存在两套字段语义。

正式发布后如需不兼容升级，必须先设计新的版本、migration、loss report 与回滚策略。不得继续沿用“内部开发期只接受当前 V1”的例外。

## 权威与生成链

Rust document types 是语义权威：

- Project/Catalog：`src-tauri/src/document/project.rs`、`production_catalog.rs`
- Show runtime contract：`src-tauri/src/document/mod.rs`
- Effect/timeline supporting types：`effect.rs`、`timeline.rs`

`src-tauri/examples/generate_show_schema.rs` 使用 `schemars` 生成 checked-in JSON Schema 和 TypeScript types：

```sh
pnpm schema:generate
pnpm schema:check
```

生成物位于 `schemas/*-v1.*` 和 `src/generated/*-v1.ts`。前端 Project/User Asset Pack runtime validation 使用这些 Schema；不要另建一棵语义不等价的手写 schema。

`schemas/temporal-fingerprint-v1.schema.json` 与 `src/generated/temporal-fingerprint-v1.ts` 由同一 Rust generator 产生，覆盖 analyzer request、identity 和 report。它是 derived runtime evidence 的交换契约，不是持久化 Effect authored intent 的替代品；Effect 的 `tempo` 仍属于 Project/Show contract。

## 校验顺序

1. 识别 `schema_version` 并严格反序列化；unknown fields 拒绝。
2. 验证字段范围、enum、颜色、公式和 typed graph。
3. 验证 ID、内部 revision 和 dependency references。
4. 验证 Stage capability、TargetSet、Cue Layer、Arrangement overlap 和 automation。
5. compile 为 typed handles、caches 和 immutable runtime snapshot。

同版本非法输入不会被“修复”后继续加载。UI normalization 只能处理不改变语义的显示细节，且必须可见。

Effect parameter 的类型事实只来自 tagged `schema`，Cue override 与 Arrangement automation 从最大 `scope` 派生。Project/User Asset Pack 中的每个 Effect还必须声明标准 Color 和完整 `tempo`；validator 不根据 Graph、Effect name 或缺失字段猜默认色或 tempo behavior。旧 Effect 缺少 `tempo`、使用未知字段或声明与 Graph 可证明事实冲突时均 fail closed；当前内部 V1 资产、Catalog、Base/Project Pack fixture 和 Golden 必须同步迁移。

## 本地缓存重置

Project cache 与 workspace preferences 使用各自的 scoped storage version。版本不匹配时只丢弃对应 key 的旧开发缓存并重建 starter state；禁止 `localStorage.clear()`、通配 key 删除或文件系统递归清理。

## 修改检查清单

- 先改 Rust types/validator，再生成 JSON Schema 和 TypeScript。
- 删除字段时同步删除所有 consumer、fixtures 和 capability metadata。
- 新增引用时补 missing/stale/duplicate/cycle tests。
- 新增用户输入格式时补 malformed/unknown-field tests。
- 运行 `pnpm schema:check`、`pnpm test`、`pnpm build` 和 `cargo test --manifest-path src-tauri/Cargo.toml`。
