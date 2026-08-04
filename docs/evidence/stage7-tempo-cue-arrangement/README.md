# Stage 7 — TempoMap、Cue 与多 Arrangement 验证证据

## 环境与门禁

- 基线：`main@aa14242`；分支：`codex/tempo-cue-arrangement`。
- 原生构建：`pnpm tauri build --debug --bundles app`。
- 最终门禁：`pnpm check:all`、`pnpm build` 全部通过。
- 自动化：49 frontend files / 116 tests；101 Rust unit + 12 integration/contracts。
- Rust gate 包含 schema check、`cargo fmt --check`、strict Clippy 与完整 tests。
- 仅保留既有 Vite `>500 kB` chunk warning；没有错误或 Stage 7 例外。

## 无 Raw DSL 用户路径

真实 Tauri 完成以下路径：

1. Stage 改为 30×30，Canvas 暴露 900 个 fixture。
2. 创建 Pulse 与 Gradient；在播放中切换、scrub、loop preview。
3. 创建 `Pulse + Gradient` Cue：Pulse r1→All，Gradient r1→3×3 Zones。
4. 在 `House 128` 放置 Cue 并添加 master automation。
5. 复制为 `Tempo Journey`，设置 0@128、3840@96、7680@150；CueClip 仍从 tick 0 开始。
6. Undo 一次回退整个 TempoMap/name transaction，Redo 恢复；在两个 Arrangement 间切换，Seek 与 Loop 保持。
7. 关闭并重开应用：两层 Cue revision pin、两个 Arrangement、三个 tempo point、automation、clip tick、选择和 loop 状态恢复。
8. Publish r1、显式 Take Live r1；随后把 Draft Gradient 更新到 r3。Header 保持 `Draft r3 / Published r1 / Live r1`，Live Library 仍为 `Gradient r1`、`Pulse r1`。
9. Draft 与 Published 按钮进入独立 Rehearsal sink；Live 按钮恢复 immutable Live r1。工作区切换不重置 Arrangement、playhead、loop 或 preview mode。

## 窗口矩阵

| 场景                | 结果                                                                                           | 证据                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 最大化              | 30×30、Published Rehearsal、Live r1 均可操作                                                   | [`published-rehearsal-maximized.jpg`](./published-rehearsal-maximized.jpg)、[`live-isolation-maximized.jpg`](./live-isolation-maximized.jpg) |
| Tauri 默认 1440×900 | 使用原生 Zoom 恢复到 `tauri.conf.json` 的 1440×900；Live 隔离保持                              | [`live-default-1440x900.jpg`](./live-default-1440x900.jpg)                                                                                   |
| 最小 1100×720       | 原生 resize 命中 min constraint；Cue Library、三段 TempoMap、Timeline、Undo/Seek/Loop 均可访问 | [`arrange-minimum-1100x720.jpg`](./arrange-minimum-1100x720.jpg)                                                                             |

Computer Use 截图桥会把高于 768 px 的窗口捕获缩放，因此 1440×900 文件编码为 1240×768；原生窗口尺寸来自 Tauri 配置与 Zoom/resize 路径。最小窗口捕获未缩放，文件像素为精确 1100×720。

## 原生验收缺陷闭环

| 发现                                                                                     | 修复与回归                                                                       |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 900 fixture Canvas 每个 rAF 都重绘，导致 WebView 主线程饥饿                              | dirty-frame render、批量 outline、大矩阵禁用 glow；`CanvasRenderer.test.ts`      |
| 播放 tick 被放进 session effect dependencies，新增第二个 Effect 后反复 cleanup/restart   | tick 从 session identity dependencies 移除；播放中切换 Effect 回归               |
| Live catalog 把 `__cue__:` authoring instances 当成 Live Pads，Pulse/Gradient 各重复一次 | 过滤 Effect/Cue preview ID；Rust unit + 原生目录只显示两个 Arrangement instances |

三项修复统一提交为 `9de1301`。

## 代码与能力审计

源码、schema、依赖与命令中没有 AudioAsset、SongAnalysis、sample position、audio follower、Rodio、Symphonia、音频导入/播放/分析或 A/V 校准。扫描中的 `waveform` 仅指灯光 Effect oscillator；`Song workspace` 仅存在于“旧选择迁移到 Arrange”的回归测试。

Stage 7.5 Production Effect Catalog/动态分区编辑器、AI、音频和真实硬件输出均未进入本证据范围。
