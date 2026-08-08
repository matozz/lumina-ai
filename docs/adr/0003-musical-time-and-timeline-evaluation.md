# ADR-0003: 整数 MusicalTime、TempoMap 与纯 Timeline 求值

- Status: Accepted
- Date: 2026-08-02
- Amended: 2026-08-08 for Authoring V1

## Context

Arrangement 的 snap、边界、Undo/Redo、Seek 和 automation 需要一个稳定时间真值。浮点 beat 和有状态 event executor 会让序列化与直接 Seek 产生漂移。

## Decision

- Arrangement 和 compiled timeline 的权威音乐时间是整数 tick，默认 PPQ 为 960。
- TempoMap 属于 Arrangement。每个 point 以 tick 定位，compiler 使用确定的分段换算；BPM、seconds 和 bar.beat.tick 只用于输入/显示。
- TimeSignatureMap 的 beat unit 为 `PPQ * 4 / denominator`；任意 meter change 都产生确定的 bar/beat 显示，不移动内容。
- CueClip 使用半开区间；结束 tick 不 active。AutomationLane 支持多个 keyframes，continuous 参数按声明插值，discrete 参数使用 hold。
- renderer 从目标 tick 的只读 index 查询 clips 和 lanes，不保存依赖调用顺序的 active-event 真相。
- Track overlap policy 必须显式。编辑命令不自动裁剪相邻 Clip；任何 trim/replace 都先生成预览，再用单 transaction 提交。
- Timeline pointer move 只更新 DOM preview，pointer up 提交一个整数 tick transaction。playhead 使用独立 DOM-ref subscription。
- 1,000 clips 的前端只挂载 viewport 与 overscan；grid 使用 CSS/常数节点方案。

## Consequences

- 修改 TempoMap 只改变时间换算，不改变 CueClip/keyframe tick。
- 顺序播放、直接 Seek 和 Replay 共享纯 evaluator，必须得到相同 Frame。
- 3/4、4/4、meter change、多 tempo、长时往返、loop edge 和 1,000-clip viewport 是固定测试门槛。
