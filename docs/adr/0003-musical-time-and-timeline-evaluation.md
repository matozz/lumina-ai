# ADR-0003: 整数 MusicalTime、TempoMap 与纯 Timeline 求值

- Status: Accepted
- Date: 2026-08-02
- Related Stage: Stage 5

## Context

Stage 4 收口时，Transport 的单调时钟与 `render_at` 已经确定，但 ShowDocument V3 Timeline 仍把 beat 和 duration 存为 `f64` event，并以 `from/to` animation 表示最多两个关键帧。旧 `TimelineExecutor` 还保存依赖调用顺序的 `last_checked_beat` 和 `active_events`；前端遇到 overlap 会静默缩短前一个 event。这个模型不能可靠表达多关键帧、任意 Seek、无损 overlap 或可撤销编辑。

Stage 5 需要更换时间与 arrangement contract，同时保持 Stage 1 Transport 作为 wall-clock owner，并且不提前引入 Stage 7 音频分析或变速检测。

## Decision

- 文档和 compiled arrangement 的权威音乐时间使用 `MusicalTime(u64)`，单位为整数 tick；默认且当前固定 PPQ 为 960。beat/seconds 只允许出现在 Transport、显示和兼容 migration 边界。
- `TempoMap` 从 Stage 5 起成为稳定接口。文档保存按 tick 排序的 tempo points；每个点的 BPM 在 compiler 中量化为整数 microseconds-per-quarter，tick↔microseconds 的分段换算不累计浮点 tick 误差。Stage 7 可以增加检测和编辑能力，但不更换接口。
- ShowDocument V4 用 Track、EffectClip、AutomationLane 和任意多个 Keyframe 替代 V3 event 列表。clip 和 keyframe 的 start/duration/boundary/snap 都是 tick；V3→V4 migration 使用 PPQ=960 对 beat 做最近 tick 量化，并报告任何非精确转换。
- Keyframe interpolation 支持 hold、linear、ease-in、ease-out、ease-in-out 和 cubic-bezier/Hermite tangents。颜色继续使用 LAB；direction/discrete 参数使用 hold。clip 结束 tick 不再 active，而 automation 在最后一个 keyframe 及其后精确保持终值。
- 每个 typed automation target 在一个文档中只有一条权威 `AutomationLane`；migration 合并旧的连续 event 段并在相同 tick 保留后写入的关键帧，避免运行时按遍历顺序选择多个真值。scalar bezier 以 in/out tangent 的 value/time 斜率做解析 Hermite 求值和积分；color 保持 LAB 插值，并因 tangent value 只对 scalar 有定义而使用确定性 smoothstep 进度。
- renderer 从目标 tick 通过只读索引查询 active clips 和 lanes。顺序播放、直接 Seek 和 Replay 都调用同一个纯函数，不保存 `active_events` 真相；旧 `TimelineExecutor` 在 Stage 5 内删除。
- overlap policy 是 Track 的显式字段：layer、replace、reject 或 crossfade。默认 migration 为 `layer`，编辑命令绝不隐式修改相邻 clip；replace 选择 `(layer, start_tick, stable source order)` 最大者，reject 在 validation 失败关闭，crossfade 对最高两层 active clip 按实际 overlap 区间线性配重，且这些策略只影响求值或显式命令结果。
- 时间轴编辑统一经过 `DocumentCommand` transaction。drag/resize pointer move 只更新 DOM transform/width preview，pointer up 提交一个 transaction；history 保存 undo/redo、save point 和 dirty state。
- 1,000 clips 的性能 gate 同时覆盖 compiled active-range query 和前端可见区域裁剪。playhead 通过独立 DOM ref 更新，不能让全部 block 随 60Hz cursor 重渲染。

## Alternatives considered

1. 继续存 `f64 beat`：序列化、snap、边界比较和重复换算会产生不可见误差，无法作为编辑历史的稳定 identity。
2. 只在 Rust runtime 转成 tick、文档继续存 beat：前后端仍有两个时间真值，Undo/Redo 和 migration 无法证明无损。
3. Seek 时从零重放有状态 executor：长 show 延迟随时间增长，且结果仍受遗漏事件或顺序依赖影响。
4. overlap 时自动裁剪前一 clip：修改用户未直接操作的数据，且目前没有预览或可靠 Undo。

## Consequences

- V1–V3 schema/artifact 继续作为 loader 输入；V4 成为 editor、Rust validator、compiler 和 generated TypeScript 的当前契约。
- Transport 可以暂时继续对外报告 beat，但进入 arrangement evaluator 时必须在单一边界量化为 MusicalTime。
- 多 tempo point 的 UI 和音频推断留到 Stage 7；Stage 5 只提供确定性数据结构、换算和单/多点 contract tests。
- 旧模板将机械迁移到 V4。视觉布局不重设计，只增加完成 Stage 5 验证所需的 keyframe/automation 与键盘路径。

## Migration and rollback

V4 migration 先生成整数时间和 arrangement contract，再切换 compiler/renderer，最后切换前端 command/history 与性能路径。每步保留 V3 loader 和 migration golden。回滚必须同时回滚 V4 schema/types/templates；不得把 V4 tick 当作 V3 beat 宽松读取。

## Related commits

- Stage 4 baseline: `d338c08`
- MusicalTime/TempoMap core: 本切片提交
- V4 arrangement contract and migration: 本切片提交
- Pure indexed tick evaluator and old executor removal: 本切片提交
- Timeline command/history and UI performance: pending
