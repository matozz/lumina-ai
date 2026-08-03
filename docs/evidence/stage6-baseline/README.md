# Stage 6 改造前原生 UI 基线

## 分支与来源

- 基线分支/提交：`main@3a690c06e8805ce9ed6e5d680eb7379b2427d997`。
- 实现分支：`codex/song-driven-dj-workspace`。
- 验证方式：2026-08-02 使用 `pnpm tauri dev` 冷启动真实 macOS Tauri/WebKit 应用，
  通过原生 Accessibility 操作模板、Timeline 和 Transport，并使用系统截图留档。
- 所有截图均来自未修改 Stage 6 产品代码的基线；Retina PNG 为原生窗口逻辑尺寸的 2 倍像素。

## 窗口矩阵

| 场景          | 原生窗口位置 | 原生窗口逻辑尺寸 | 证据                                                               |
| ------------- | ------------ | ---------------- | ------------------------------------------------------------------ |
| 冷启动最大化  | `(0, 33)`    | `1512 × 892`     | [`baseline-maximized.png`](./baseline-maximized.png)               |
| 推荐 1440×900 | `(36, 33)`   | `1440 × 891`     | [`baseline-common-1440x891.png`](./baseline-common-1440x891.png)   |
| 配置最小尺寸  | `(150, 100)` | `1100 × 720`     | [`baseline-minimum-1100x720.png`](./baseline-minimum-1100x720.png) |

当前显示器可用区把请求的 `1440 × 900` 高度约束为 `891`；三个场景均为普通最大化/窗口态，
`AXFullScreen=false`。既有 `maximized=true`、`1100 × 720` 最小尺寸约束均生效。

## 旧用户路径

1. 冷启动直接显示 Raw DSL Editor、Canvas 和 Control，普通用户必须先理解并选择 JSON 模板。
2. 切换到 Timeline 后才出现底部 Sequencer；固定 DSL/Control 宽度继续压缩 Canvas。
3. 通过 Raw DSL 模板选择 `combined` 后，Timeline 才获得多个 effect clip 与 automation track。
4. 使用真实 AX 操作启动播放，Transport 切换为 Pause，Timeline/播放头由同一既有运行时驱动。
5. 使用 Stop 回到起点，并分别验证推荐尺寸和最小尺寸。

对应证据：

- [`baseline-timeline-path.png`](./baseline-timeline-path.png)：从 Live Pad 切换到旧 Timeline。
- [`baseline-arrangement-path.png`](./baseline-arrangement-path.png)：`combined` 文档中的 clip/automation 编排。
- [`baseline-playback-path.png`](./baseline-playback-path.png)：真实播放中的 Pause、时间位置和 playhead。

## 基线结论

- Stage 0–5 的确定性 Transport、Timeline、PointerEvents/DOM preview、snap、duration、Undo/Redo
  和窗口约束均存在，Stage 6 必须在其上重组产品外壳，不能重写这些交互内核。
- Raw DSL 是当前唯一工程入口，与“Stage → Effect Lab → Song → Arrange → Live/Rehearse”
  的用户心智不匹配；Stage 6 需将其移入显式 Advanced Mode。
- 固定 DSL + Canvas + Control + 条件 Timeline 的布局缺少可调整面板和上下文 Inspector；
  最小窗口虽然不重叠，但主工作区与用户可读名称不足。
- 当前基线不存在歌曲导入、波形、人工 downbeat 校正或稳定 SongAnalysis；这些属于 Stage 7，
  不应在 Stage 6 通过伪数据标记完成。
