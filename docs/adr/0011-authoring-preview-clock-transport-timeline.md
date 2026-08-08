# ADR-0011: Authoring PreviewClock、Transport 与 CueClip Timeline 边界

- Status: Accepted
- Date: 2026-08-04
- Amended: 2026-08-08 for Authoring V1
- Extends: ADR-0001、ADR-0003、ADR-0010

## Context

Lab、Cues 和 Arrange 需要同一套音乐时钟与交互语义，但不能复用或控制 Live scheduler。Timeline 还必须在大量 CueClip 下维持 60fps drag、resize、keyframe 和 playhead 更新。

## Decision

- Live Transport 由 Rust monotonic clock、单 scheduler 和 active immutable snapshot 拥有。
- Authoring Transport 只控制 PreviewSession cursor 和 PreviewSink，提供 Play、Pause、Stop、Seek、Loop 和 Local/Follow Arrangement clock。
- Stage、Lab、Cues 和 Arrange 默认 128 BPM。workspace mount、asset selection 和 workspace switching 不是 transport commands，绝不自动 Play、Stop 或 Seek。
- 每个 Effect、Cue 和 Arrangement authoring scope 拥有独立 session entry；cursor、loop 和 playback state 不进入 ProjectBundle。
- Local preview timing 只存在于 session。Follow Arrangement 读取选中 Arrangement 的完整 PPQ、TempoMap 和 TimeSignatureMap。
- cursor 从 monotonic elapsed time 经 TempoMap 反解，不能按 `requestAnimationFrame` delta 累加浮点 beat。
- ArrangementTimeline 直接编辑 CueClip 和 typed automation。Pointer move 只更新 DOM refs；pointer up/cancel 最多提交一个 transaction。
- playhead 使用独立轻量 subscription；viewport virtualization、adaptive snap、CSS grid 和 overscan 避免内容长度决定 DOM 数量。
- action-local validation failure 不写 ProjectBundle/history，并在相关 inspector/control 附近显示 recovery。

## Consequences

- TempoMap/拍号修改不移动 Clip 或 keyframe tick。
- 页面打开、工作区切换与资产选择的 stopped 状态必须有回归测试。
- 3/4、4/4、meter/tempo change、loop edge、workspace switching、1,000 clips 和 1100×720 是固定验收门槛。
- 详细交互约束见 [`../authoring/arrangements.md`](../authoring/arrangements.md)。
