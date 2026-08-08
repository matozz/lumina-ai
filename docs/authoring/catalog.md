# Catalog 与用户资产

## 内置 Catalog

内置资产位于受源码管理、可人工编辑的声明式目录：

```text
catalog/builtin/
  generators/
  layouts/
  effects/
  cues/
  arrangements/
  project-templates/
```

每个 Layout、Effect、Cue recipe、Arrangement 和 Project Template 使用独立 JSON 文件。`src-tauri/build.rs` 在构建时聚合运行时 Catalog；前端通过 `src/catalog/builtinCatalog.ts` 加载布局、编排和模板。Effect/Cue 的 `_order.json` 只控制稳定展示顺序。

内置资产默认只读。用户 Save/Customize/Duplicate 时生成 ProjectBundle 内的新资产和独立 ID，不覆盖 Catalog 源文件。

## 校验与 Golden

`pnpm catalog:check` 执行：

1. JSON/Rust contract 解析；
2. identity、exact reference 和 Generator Registry 校验；
3. Effect parameter/graph/capability/risk 校验；
4. Cue recipe 解析和共享属性 writer 检查；
5. runtime sampled output 与 determinism 检查；
6. Production render、compatibility 和 Generator coordinate Golden 比对。

修改经过审查后运行 `pnpm catalog:golden:update`，并提交 `catalog/production-compatibility-v1.json`、Generator Golden 和 Rust production Golden 的有意差异。

## 用户资产包

Header 的 **Assets** 菜单支持导出项目资产依赖闭包和导入 `user-asset-pack.json`。包包含 Layout、Effect、Cue 和 Arrangement；不包含 localStorage、Live snapshot 或内置 Catalog 文件。

导入流程：

1. JSON Schema + semantic/reference validation。
2. 检测目标项目中的 ID 冲突。
3. 用户选择拒绝导入，或整体 rename；rename 会同步重写包内所有引用。
4. 单次 transaction 写入 ProjectBundle。

导出的文件是跨项目迁移和长期备份来源。localStorage 只是工作区缓存。

## Reset defaults

Reset defaults 恢复 starter Project Template、工作区选择和 Authoring transport 默认值。它不会删除浏览器下载目录中的资产包，也不会执行 origin-wide `localStorage.clear()` 或文件系统宽泛删除。

## 关键实现

- Catalog aggregation：`src-tauri/build.rs`
- Runtime validation：`src-tauri/src/document/production_catalog.rs`
- Frontend loader：`src/catalog/builtinCatalog.ts`
- User pack：`src/document/userAssetPack.ts`、`src/document/userAssetPackFile.ts`
- UI：`src/workspace/WorkspaceAssetPackMenu.tsx`

## 验收

- 所有内置 JSON 可单独 review，且聚合后 Catalog schema/semantic/Golden 均通过。
- 复制内置资产后 ID 独立，修改不改变源文件或其他项目。
- 用户包闭包完整；跨项目 reject/rename 冲突路径均有测试。
- Reset 后 starter 正常、transport stopped，之前导出的资产包仍可重新导入。
