# ADR-0011: Authoring PreviewClock、Transport 与 CueClip Timeline 边界

- Status: Accepted
- Date: 2026-08-04
- Amended: 2026-08-23 for Arrangement preview fullscreen
- Extends: ADR-0001、ADR-0003、ADR-0010

## Context

Lab、Cues 和 Arrange 需要同一套音乐时钟与交互语义，但不能复用或控制 Live scheduler。Timeline 还必须在大量 CueClip 下维持 60fps drag、resize、keyframe 和 playhead 更新。

## Decision

- Live Transport 由 Rust monotonic clock、单 scheduler 和 active immutable snapshot 拥有。
- Authoring Transport 只控制 PreviewSession cursor 和 PreviewSink，提供 Play、Pause、Stop、Seek、Loop 和 Local/Follow Arrangement clock。
- Stage、Lab、Cues 和 Arrange 默认 128 BPM。workspace mount 不自动 Play。Lab/Cues 内的 asset selection 在 stopped/paused 时不自动 Play；正在 playing 时把 cursor、loop 与 playback 连续迁移到同 scope 的新资产。workspace switching 是明确的 authoring context boundary，会 Stop 并回到 loop start（无 loop 时为 tick 0）。
- 每个 Effect、Cue 和 Arrangement authoring scope 拥有独立 session entry；cursor、loop 和 playback state 不进入 ProjectBundle。
- Local preview timing 只存在于 session。Follow Arrangement 读取选中 Arrangement 的完整 PPQ、TempoMap 和 TimeSignatureMap。
- cursor 从 monotonic elapsed time 经 TempoMap 反解，不能按 `requestAnimationFrame` delta 累加浮点 beat。
- Effect、Cue 和 Arrangement 的真实 runtime preview 都以最高 60fps 请求；任一时刻只允许一个 render IPC in flight，并合并积压 tick，避免高延迟时形成无界队列。首次编译帧携带 Layout，后续同 generation 帧只传 fixture output；Canvas 只在 generation 或 Layout draft 变化时重建灯具与 fit camera。
- ArrangementTimeline 直接编辑 CueClip 和 typed automation。Pointer move 只更新 DOM refs；pointer up/cancel 最多提交一个 transaction。
- playhead 使用独立轻量 subscription；viewport virtualization、adaptive snap、CSS grid 和 overscan 避免内容长度决定 DOM 数量。
- action-local validation failure 不写 ProjectBundle/history，并在相关 inspector/control 附近显示 recovery。
- Arrangement Preview fullscreen 是 workspace 展示状态：Tauri 使用当前原生窗口 fullscreen 并只展示 Preview surface，浏览器使用 element fullscreen；它不复制 Preview 算法、不改变 PreviewSession，也不写入 ProjectBundle。

## Consequences

- TempoMap/拍号修改不移动 Clip 或 keyframe tick。
- 页面打开的 stopped 状态、同 scope 资产切换的 playing 连续性，以及工作区切换的 Stop/reset 都必须有回归测试。
- 3/4、4/4、meter/tempo change、loop edge、workspace switching、1,000 clips 和 1100×720 是固定验收门槛。
- 详细交互约束见 [`../authoring/arrangements.md`](../authoring/arrangements.md)。
