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

Cue Layer ID 同样是内部 exact-reference identity：创建时生成、编辑时稳定、复制时重生。它不编码业务语义，普通 UI 不展示；Arrangement automation 仍以 `clip_id + layer_id + parameter_id` 精确定位。

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

- 用户选择的 Project 文件夹是当前项目的权威持久化边界。`lumina-project.json` 保存最新、经完整校验的 `ProjectBundle`；每次有内容变化的替换会先把上一版写入 `history/lumina-project-<timestamp>-<sequence>.json`，只保留最近 50 版。最新文件和历史文件都使用临时文件 + rename 原子提交，已有但无效的 latest 会 fail closed，不能被覆盖。
- App 首次打开时保存路径为空，必须在阻塞弹窗中选择文件夹后才能继续。路径只在成功加载已有 latest 或成功初始化空文件夹后写入 scoped `localStorage`；缓存路径失效时重新进入选择弹窗。已有 latest 始终优先于浏览器缓存；空文件夹才使用当前 recovery cache/starter 初始化。
- ProjectBundle transaction 后使用 trailing 2 秒合并保存；连续编辑只提交最后状态，进行中的写入串行完成。workspace 选择、播放头、Zoom/Snap 和 transport session 不属于 ProjectBundle，不触发项目版本。
- `lumina-project-v1` 的 `localStorage` 仍保留工作区 recovery shadow 和资产选择，用于首次升级选择空文件夹时避免丢失当前编辑，但不是重开项目的权威来源。storage version 只负责一次性拒绝旧 contract 缓存并恢复当前 starter bundle；不会扫描或宽泛删除浏览器存储。
- 用户显式下载的资产包位于浏览器下载位置，不受 Reset defaults 影响。
- Reset defaults 作为普通 ProjectBundle transaction 恢复内置 starter template，并在 2 秒后保存为 latest；被替换的用户项目进入历史。它不删除项目文件夹、历史或下载的资产包。

## 关键实现

- Rust contract：`src-tauri/src/document/project.rs`
- Rust reference/semantic validation：`src-tauri/src/document/project_validation.rs`
- Project compiler：`src-tauri/src/compiler/project.rs`
- Frontend contract helpers：`src/document/projectBundle.ts`、`src/document/projectModel.ts`
- Persistence state/controller：`src/stores/projectStorage.ts`
- Validated atomic file commands：`src-tauri/src/project_storage.rs`
- Project editing/cache：`src/stores/project.ts`
- Starter assembly：`src/workspace/defaultProjectBundle.ts`

## 验收

- 保存/重开、Undo/Redo、workspace cache reset 和历史轮换不改变 tick 或引用语义。
- 启动必须选择可用文件夹；已有 latest 重开、空文件夹初始化、2 秒 burst 合并、串行写入和最多 50 版历史均通过测试。
- 缺失、陈旧、重复或循环引用 fail closed，并定位到资产字段。
- 页面打开时 transport 保持 stopped；切换功能区会 Stop/reset。Lab/Cues 内选择资产不会自行播放，但会延续用户已明确启动且当前仍为 playing 的同 scope 预览。
- Go Live 失败不替换当前 Live snapshot。
