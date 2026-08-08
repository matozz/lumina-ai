# Project 模型

## 资产边界

`ProjectBundle` 是原子保存和传输容器，不是单体 Show 文档。它包含：

- `ProjectManifest`：工程身份、当前 Stage、Layout、Effect、Cue、Arrangement 的索引与选择。
- `StageDocument`：Patch、Fixture Group、TargetSet、TargetingScene 和一个精确 Layout 引用。
- `LayoutDefinition`：独立几何与编辑能力。
- `EffectDefinitionDocument`：target-agnostic graph、参数、能力和风险信息。
- `CueDefinition`：固定 Stage 上的一组 Effect/TargetSet layers。
- `ArrangementDocument`：TempoMap、拍号、CueClip tracks、自动化和 marker。

所有持久化引用都包含稳定 ID 和内部 revision。display name 不是 identity，`latest` 不是合法引用。revision 用于精确解析和 immutable runtime snapshot；普通 UI 不显示它。

## 引用方向

```text
Manifest
  ├─ Stage ── Layout
  │    └─ TargetSet / TargetingScene
  ├─ Effect
  ├─ Cue ── Stage + Effect + TargetSet
  └─ Arrangement ── Cue
```

Stage 不拥有 Effect 或时间轴；Effect 不拥有 Stage/TargetSet；Arrangement 只调度 Cue。任何更新都必须创建或选择一组可完整解析的精确引用，不能在依赖方背后替换内容。

## Authoring 与 Live

Stage、Lab、Cues 和 Arrange 使用隔离的 Authoring PreviewSession。编辑表单可以持有 session-local working copy；只有通过完整校验的 Save transaction 才进入 ProjectBundle 和 Undo history。

**Go Live** 是唯一能改变 Live 输出的产品动作。它重新验证所选 Arrangement 的完整 dependency closure，编译 immutable snapshot，再显式激活。页面打开、工作区切换、资产选择、预览、Reset 或普通 Save 都不能隐式启动 transport 或改变 Live。

## 存储

- ProjectBundle 是项目资产的长期可导出来源。
- `localStorage` 只缓存当前开发工作区。`src/stores/project.ts` 的 storage version 负责一次性拒绝旧缓存并恢复当前 starter bundle；不会扫描或宽泛删除浏览器存储。
- 用户显式下载的资产包位于浏览器下载位置，不受 Reset defaults 影响。
- Reset defaults 只恢复内置 starter template、工作区选择、transport 默认值和本地缓存。

## 关键实现

- Rust contract：`src-tauri/src/document/project.rs`
- Rust reference/semantic validation：`src-tauri/src/document/project_validation.rs`
- Project compiler：`src-tauri/src/compiler/project.rs`
- Frontend contract helpers：`src/document/projectBundle.ts`、`src/document/projectModel.ts`
- Persistence/commands：`src/stores/project.ts`
- Starter assembly：`src/workspace/defaultProjectBundle.ts`

## 验收

- 保存/重开、Undo/Redo 和 workspace cache reset 不改变 tick 或引用语义。
- 缺失、陈旧、重复或循环引用 fail closed，并定位到资产字段。
- 切换工作区或资产后 transport 仍保持 stopped，除非用户此前明确播放。
- Go Live 失败不替换当前 Live snapshot。
