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

每个 Layout、Effect、Cue recipe、Arrangement 和 Project Template 使用独立 JSON 文件。Project Template 可声明 starter Cue，用于把 Arrangement 示例依赖完整物化到新 ProjectBundle；这些 Cue 仍遵守 Effect → Cue Layer → TargetSet 的引用方向。`src-tauri/build.rs` 在构建时聚合运行时 Catalog；前端通过 `src/catalog/builtinCatalog.ts` 加载布局、效果、编排和模板。Effect/Cue 的 `_order.json` 只控制稳定展示顺序。

内置资产默认只读。用户 Save/Customize/Duplicate 时生成 ProjectBundle 内的新资产和独立 ID，不覆盖 Catalog 源文件。

同一 built-in Effect ID 可以同时保留多个 revision。Catalog UI 对新选择默认展示最新 revision；已存在的 Cue、recipe、Arrangement 和 Project Template 仍使用提交在 JSON 中的 exact ref，不以 `latest` 替换。兼容现有 Schema、参数和引用的行为修复直接修改当前 Catalog 源文件，不为每次修复机械增加 revision 或兼容配置；只有无法保持兼容、必须让新旧行为并存时才新增 revision。不同 Effect ID 仍不得产生不可区分的重复输出。

Cue recipe 与 Project Template 中的 Layer ID 也是持久化引用。新声明使用固定的 opaque ID；如果内置 revision 确需迁移 identity，所有 layer override 与 automation target 必须在同一源码变更中精确重映射，并通过完整 ProjectBundle validation。

## 校验与 Golden

`pnpm catalog:check` 执行：

1. JSON/Rust contract 解析；
2. identity、exact reference 和 Generator Registry 校验；
3. Effect parameter/graph/capability/risk 校验；
4. Cue recipe 解析和共享属性 writer 检查；
5. 将 Project Template、starter Cue、Effect 依赖和所有内置 Arrangement 组装成完整 ProjectBundle，再执行 exact-ref、TargetSet、MixPolicy 和 automation 语义校验；
6. runtime sampled output 与 determinism 检查；
7. Production render、compatibility 和 Generator coordinate Golden 比对。

修改经过审查后运行 `pnpm catalog:golden:update`，并提交 `catalog/production-compatibility-v1.json`、Generator Golden 和 Rust production Golden 的有意差异。新增或调整 standard Color 参数时还要验证 typed schema、scope、Cue/Arrangement exact target、Lab midpoint/endpoints、清除后的 fallback 与实际 `color.rgb` 输出；兼容修改直接更新现有源文件，不为此机械新增 revision。

Effect parameter 不再在 Catalog metadata 中维护 `parameter_summary`，也不维护与 parameter schema 重复的 type/default/policy 字段。Catalog discovery 只保留作者可理解的 family/category/visibility/mood/energy/density/motion/colorfulness/strobe risk；`required_attributes` 和 `layout_capabilities` 是显式兼容性承诺，由完整 Project validation 与 Golden 交叉验证。

## 用户资产包

Header 的 **Assets** 菜单支持导出项目资产依赖闭包和导入 `user-asset-pack.json`。包包含 Layout、Effect、Cue 和 Arrangement；不包含 localStorage、Live snapshot 或内置 Catalog 文件。

导入流程：

1. JSON Schema + semantic/reference validation；Effect 必须已经使用当前 parameter contract 并声明标准 Color，不在导入时迁移或补字段。
2. 检测目标项目中的 ID 冲突。
3. 用户选择拒绝导入，或整体 rename；rename 会同步重写包内所有引用。
4. 单次 transaction 写入 ProjectBundle。

导出的文件是跨项目迁移和长期备份来源。localStorage 只是工作区缓存。

## Reset defaults

Reset defaults 恢复 starter Project Template、工作区选择和 Authoring transport 默认值。它不会删除浏览器下载目录中的资产包，也不会执行 origin-wide `localStorage.clear()` 或文件系统宽泛删除。

当受源码管理的 starter/Catalog 资产集合、参数基准、身份或依赖发生不兼容变化时，只提升 `lumina-project-v1` 的 scoped storage version；旧开发缓存通过 Zustand migration 在该 storage boundary 重建为当前模板，不触碰其他 origin storage 或用户显式导出的资产包。

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
