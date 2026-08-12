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

Header 的 **Assets** 菜单可修改当前 Project 名称，并显示当前 Project 文件夹及历史数量；名称在失焦或 Enter 时作为一次可撤销 transaction 提交，再进入既有 autosave。菜单也允许切换文件夹；目标中已有 `lumina-project.json` 时打开该项目，空文件夹则以当前 ProjectBundle 初始化。相同菜单提供两种 UserAssetPack V1 导出，并使用同一个导入入口：

- **Export asset pack** 导出适合跨项目迁移的最小依赖闭包：project-local Layout/Effect、当前 Cue、非空或 project-local Arrangement，以及它们精确引用的 Stage/Layout/Effect/Cue。
- **Export base asset pack** 导出当前 ProjectBundle 中完整的 Stage、Layout、Effect、Cue 和 Arrangement 资产数组，包括仍为空的基础 Arrangement。它使用与 Project 名称无关的通用包名 `Base Assets` 和文件名 `base-assets.lumina-assets.json`，用于 Skill 的显式输入快照、项目引导或其他离线复用；导出不改变当前项目，也不重新加入已从当前 Project 删除的资产。

两种包都不包含 Project manifest/当前选择、项目文件夹、history、localStorage、UI/transport 状态、Live snapshot 或受源码管理的 Catalog 目录。Base pack 是用户主动导出的可移植快照，不取代 Project 文件夹中 `lumina-project.json` 的持久化权威。

导入流程：

1. JSON Schema + semantic/reference validation；Effect 必须已经使用当前 parameter contract 并声明标准 Color，不在导入时迁移或补字段。
2. 检测目标项目中的 ID 冲突。
3. 用户选择拒绝导入，或整体 rename；rename 会同步重写包内所有引用。
4. 单次 transaction 写入 ProjectBundle。

导出的文件用于跨项目迁移；Project 文件夹中的 latest + 最近 50 版 history 是当前项目的持续备份来源。app config cache 只记忆已验证的文件夹路径；localStorage 只保留 recovery shadow 和 UI 状态。

## Reset defaults

Reset defaults 恢复 starter Project Template、工作区选择和 Authoring transport 默认值。恢复后的 ProjectBundle 会按普通编辑保存，旧 latest 进入 history；它不会删除 Project 文件夹、history、浏览器下载目录中的资产包，也不会执行 origin-wide `localStorage.clear()` 或文件系统宽泛删除。

当受源码管理的 starter/Catalog 资产集合、参数基准、身份或依赖发生不兼容变化时，只提升 `lumina-project-v1` 的 scoped storage version；旧开发缓存通过 Zustand migration 在该 storage boundary 重建为当前模板，不触碰其他 origin storage 或用户显式导出的资产包。

## 关键实现

- Catalog aggregation：`src-tauri/build.rs`
- Runtime validation：`src-tauri/src/document/production_catalog.rs`
- Frontend loader：`src/catalog/builtinCatalog.ts`
- User pack：`src/document/userAssetPack.ts`、`src/document/userAssetPackFile.ts`
- Project folder storage：`src/stores/projectStorage.ts`、`src-tauri/src/project_storage.rs`
- UI：`src/workspace/WorkspaceAssetPackMenu.tsx`

## 验收

- 所有内置 JSON 可单独 review，且聚合后 Catalog schema/semantic/Golden 均通过。
- 复制内置资产后 ID 独立，修改不改变源文件或其他项目。
- 用户包闭包完整；跨项目 reject/rename 冲突路径均有测试。
- Base pack 与当前 Project 的五类资产数组精确一致，包含空基础 Arrangement，导出不创建 Project transaction 或 history。
- Assets 可修改 Project 名称并切换 Project 文件夹；已有 latest 优先加载，空文件夹安全初始化，失败路径不写入缓存或覆盖文件。
- Reset 后 starter 正常、transport stopped，之前导出的资产包仍可重新导入。
