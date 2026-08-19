# Lumina Authoring V1

本目录是 Lumina 作者工作流、持久化模型和扩展约束的唯一入口。实现、测试和代码评审都以这里描述的当前 V1 为准；历史阶段计划和旧编辑器说明不再作为实现依据。

## 完整链路

```text
Layout
  → Stage / Patch / TargetSet
  → Effect
  → Cue Layer
  → Arrangement CueClip
  → Live
```

- [Project 模型](project-model.md)：资产所有权、精确引用、工作区缓存和 Live 边界。
- [Layouts](layouts.md)：Generator Registry、容量、坐标、Stage 应用和预览。
- [Effects](effects.md)：target-agnostic EffectGraph、参数和安全预览。
- [TargetSets 与 Cues](target-sets-and-cues.md)：分区、Cue Layer、MixPolicy 和多区域编排。
- [Arrangements](arrangements.md)：CueClip、TempoMap、自动化和时间轴交互。
- [Catalog](catalog.md)：内置资产、项目资产、资产包、导入导出和 Reset。
- [Schema](schema.md)：当前 V1 权威来源、生成物、校验和升级规则。

## 产品工作流

1. 在 **Stage** 选择或复制 Layout，检查完整几何预览，再用 **Use on Stage** 按容量生成 fixtures、Patch 和安全的 TargetSet。
2. 在 **Lab** 选择内置 Effect 预览；需要修改时先复制为项目 Effect。
3. 在 **Cues** 为每个 Layer 选择 Effect 和 Stage TargetSet。需要同时作用多个区域时使用一个多 Layer Cue；需要分时出现时创建多个 Cue。
4. 在 **Arrange** 放置 CueClip，使用 Focus mode、框选、批量编辑和右键菜单完成位置、时长、重叠策略及 typed automation。CueClip 不直接重新选择 TargetSet。
5. 在 **Live** 检查当前 Arrangement；只有明确的 **Go Live** 操作会验证、编译并激活新的 immutable runtime snapshot。

Stage、Lab、Cues 和 Arrange 的默认节拍均为 128 BPM。打开页面默认不播放；切换功能区会停止 Authoring Transport 并回到 loop start（未启用 loop 时为 tick 0）。Lab/Cues 内选择另一个 Effect/Cue 不会自行开始播放，但若当前预览正在播放，新资产会继承 cursor 与 playing 状态，便于连续比较。

Arrange 的 Space 固定为播放/暂停。Zoom、Snap 与视觉 Grid 是三个独立状态；Fit 只改变视口，不改动文档、Snap 或 BPM。Cue Layer 的 opaque identity 与 display name 分离，普通 UI 和辅助功能名称只显示可理解的 Cue、TargetSet、Effect、Layer 序号和参数名。

## AI 完整编排协作

Repo-local [`lumina-full-arrange`](../../.agents/skills/lumina-full-arrange/SKILL.md) Skill 提供首版离线协作路径：用户显式导出并提供 Base Asset Pack 或普通 Project Pack，Skill 校验并审查实际资产，经对话确认完整 Arrangement brief 后，生成新的、经过验证的 Project Pack。用户再通过 Assets Import 选择 Incremental 或 Replace 导入结果；完整生成包通常可用 Replace 直接重置当前资产，局部包使用 Incremental 追加。

这条路径不把 UserAssetPack 当作 Project manifest，不读取或写入当前 Project 文件夹、`lumina-project.json`、history、localStorage 或 WebView SQLite，也不自动改写 App 当前项目。Skill 可调用 checked-in temporal analyzer CLI，以真实 runtime fingerprint/contact sheet 审计 Effect 选择、生成和调速；它仍不替代导入后的真实 Arrange/Live 窗口验收。

## 工程约束

### Frontend

- Tailwind class 合并使用 `src/lib/utils.ts` 的 `cn()`。
- Timeline 的拖拽、缩放、关键帧和 playhead 高频路径使用原生 Pointer Events、DOM refs 与 `requestAnimationFrame`；pointer move 不写 Project store，也不触发整个 React timeline 重渲染。
- Project 和跨工作区状态使用 Zustand；局部、低频表单状态可以留在组件内。
- 1100×720 是最小可操作窗口。面板必须允许收缩和滚动，不能依赖固定大屏宽度。

### Compiler 与 engine

- Rust document types 是语义权威。JSON/schema 校验先于引用校验，引用校验先于 capability、geometry 和 graph compile。
- compiler 一次性解析精确引用、fixture handles、TargetSet bitsets、空间排序、scene steps、automation indexes 和 mixer routes。render 热路径不得解析 JSON/自由字符串、线性搜索 fixture 或修改拓扑。
- `render_at` 对相同 snapshot、tick、seed 和 overrides 必须确定；Seek、Replay 和顺序播放共享同一求值路径。
- scheduler 使用 Tokio 单 worker 和 monotonic clock。阻塞 I/O 不得运行在主线程或持有 engine runtime 锁。
- Tauri command 错误返回可呈现的诊断；普通 command 保持 `Result<T, String>` 边界。

## 修改检查清单

1. 确认资产所有权与引用方向没有改变。
2. 修改 Rust contract 后运行 `pnpm schema:generate` 并提交生成物。
3. 修改 Catalog 或 Generator 后运行 `pnpm catalog:golden:update`，审查 Golden 差异。
4. 为 schema、语义、交互和失败恢复补测试。
5. 运行 `pnpm check:all`。
6. 对用户路径做真实窗口复核，至少覆盖 1100×720 和常用大窗口。

必要架构决策见 ADR-0001、0002、0003、0004、0005、0010、0011、0012、0013 和 0014。
