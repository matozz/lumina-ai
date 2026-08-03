# ADR-0003: 整数 MusicalTime、TempoMap 与纯 Timeline 求值

- Status: Accepted
- Date: 2026-08-02
- Related Stage: Stage 5
- Amendment: 2026-08-03，原 Audio/Song 方向被撤销；多段 TempoMap 明确保留为 Arrangement 时钟能力，不等同于音频能力

## Context

Stage 4 收口时，Transport 的单调时钟与 `render_at` 已经确定，但 ShowDocument V3 Timeline 仍把 beat 和 duration 存为 `f64` event，并以 `from/to` animation 表示最多两个关键帧。旧 `TimelineExecutor` 还保存依赖调用顺序的 `last_checked_beat` 和 `active_events`；前端遇到 overlap 会静默缩短前一个 event。这个模型不能可靠表达多关键帧、任意 Seek、无损 overlap 或可撤销编辑。

Stage 5 需要更换时间与 arrangement contract，同时保持 Stage 1 Transport 作为 wall-clock owner，并且不提前引入 Stage 7 音频分析或变速检测。

## Decision

- 文档和 compiled arrangement 的权威音乐时间使用 `MusicalTime(u64)`，单位为整数 tick；默认且当前固定 PPQ 为 960。beat/seconds 只允许出现在 Transport、显示和兼容 migration 边界。
- `TempoMap` 从 Stage 5 起成为稳定接口。文档保存按 tick 排序的 tempo points；每个 point 的 BPM 在 compiler 中量化为整数 microseconds-per-quarter，tick↔microseconds 的分段换算不累计浮点 tick 误差。它属于 Arrangement 自身的确定性时钟，不依赖音频、歌曲分析或 sample position。
- ShowDocument V4 用 Track、EffectClip、AutomationLane 和任意多个 Keyframe 替代 V3 event 列表。clip 和 keyframe 的 start/duration/boundary/snap 都是 tick；V3→V4 migration 使用 PPQ=960 对 beat 做最近 tick 量化，并报告任何非精确转换。
- Keyframe interpolation 支持 hold、linear、ease-in、ease-out、ease-in-out 和 cubic-bezier/Hermite tangents。颜色继续使用 LAB；direction/discrete 参数使用 hold。clip 结束 tick 不再 active，而 automation 在最后一个 keyframe 及其后精确保持终值。
- 每个 typed automation target 在一个文档中只有一条权威 `AutomationLane`；migration 合并旧的连续 event 段并在相同 tick 保留后写入的关键帧，避免运行时按遍历顺序选择多个真值。scalar bezier 以 in/out tangent 的 value/time 斜率做解析 Hermite 求值和积分；color 保持 LAB 插值，并因 tangent value 只对 scalar 有定义而使用确定性 smoothstep 进度。
- renderer 从目标 tick 通过只读索引查询 active clips 和 lanes。顺序播放、直接 Seek 和 Replay 都调用同一个纯函数，不保存 `active_events` 真相；旧 `TimelineExecutor` 在 Stage 5 内删除。
- overlap policy 是 Track 的显式字段：layer、replace、reject 或 crossfade。默认 migration 为 `layer`，编辑命令绝不隐式修改相邻 clip；replace 选择 `(layer, start_tick, stable source order)` 最大者，reject 在 validation 失败关闭，crossfade 对最高两层 active clip 按实际 overlap 区间线性配重，且这些策略只影响求值或显式命令结果。
- 时间轴编辑统一经过 `DocumentCommand` transaction。drag/resize pointer move 只更新 DOM transform/width preview，pointer up 提交一个 transaction；history 保存 undo/redo、save point 和 dirty state。
- 1,000 clips 的性能 gate 同时覆盖 compiled active-range query 和前端可见区域裁剪。viewport 以整数 beat 量化并带 8-beat overscan，clip、automation subtrack 和 bar label 只挂载相交区域；beat grid 使用 CSS repeating pattern，不按总时长创建节点。
- playhead 独立订阅 engine store 并直接更新 DOM ref transform；drag/resize pointermove 同样只修改目标 block 的 transform/width。两条高频路径都绕过 timeline React render tree，toolbar 的轻量时间显示可以独立订阅。
- AutomationLane 创建只消费当前 V4 EffectDefinition/Instance 的 typed parameter metadata。UI 必须按 instance 声明的 definition revision 精确解析参数，以 instance override 优先、definition default 兜底；已有 target 从菜单隐藏，最终唯一性仍由 `DocumentCommand` fail-closed 验证。continuous 参数初始 segment 使用 linear，discrete 参数强制从 hold 开始。
- automation row 直接渲染 V4 的任意多个 keyframe，不再把 lane 降级成 from/to。keyframe pointermove 只更新目标 DOM transform，pointerup 以一个整数 tick delta command 提交；box selection 和键盘移动使用相同 command。bar.beat.tick 与 seconds 只从 tick、PPQ、TempoMap 派生，percent/degree/color 等只做 inspector 显示转换，不成为第二个存储真相。
- overlap policy 的 layer/replace/reject/crossfade 继续只影响纯求值，不允许隐式改写文档。显式 trim/replace 操作必须先由纯 planner 计算半开区间 overlap、受影响 IDs 和精确 tick/source offset preview；用户确认后，trim 当前 clip 或删除重叠 clips 分别形成一个 transaction，Undo 恢复完整快照。

## Alternatives considered

1. 继续存 `f64 beat`：序列化、snap、边界比较和重复换算会产生不可见误差，无法作为编辑历史的稳定 identity。
2. 只在 Rust runtime 转成 tick、文档继续存 beat：前后端仍有两个时间真值，Undo/Redo 和 migration 无法证明无损。
3. Seek 时从零重放有状态 executor：长 show 延迟随时间增长，且结果仍受遗漏事件或顺序依赖影响。
4. overlap 时自动裁剪前一 clip：修改用户未直接操作的数据，且目前没有预览或可靠 Undo。

## Consequences

- V1–V3 schema/artifact 继续作为 loader 输入；V4 成为 editor、Rust validator、compiler 和 generated TypeScript 的当前契约。
- Transport 可以暂时继续对外报告 beat，但进入 arrangement evaluator 时必须在单一边界量化为 MusicalTime。
- 多 tempo point 继续由 V4 contract 与 Advanced DSL 支持；音频推断和 beat-grid 校正 UI 已取消。30 分钟两段 TempoMap 的 tick↔microseconds 往返误差为 0。
- 旧模板将机械迁移到 V4。视觉布局不重设计，只增加完成 Stage 5 验证所需的 keyframe/automation 与键盘路径。

## Migration and rollback

V4 migration 先生成整数时间和 arrangement contract，再切换 compiler/renderer，最后切换前端 command/history 与性能路径。每步保留 V3 loader 和 migration golden。回滚必须同时回滚 V4 schema/types/templates；不得把 V4 tick 当作 V3 beat 宽松读取。

## Related commits

- Stage 4 baseline: `d338c08`
- MusicalTime/TempoMap core: `13645ec`
- V4 arrangement contract and migration: `11955ab`
- Pure indexed tick evaluator and old executor removal: `aa37595`
- DocumentCommand transaction/history/save point: `c82c842`
- Timeline DOM preview/virtualization/playhead isolation: `34473b9`
- Typed parameter menu and AutomationLane creation: `82b29b6`
- Multi-keyframe row, typed inspector, and derived time display: `fb0e913`
- Explicit overlap preview and undoable trim/replace: `fffaf0b`
- Pointer selection and keyboard focus handoff: `1e0f880`
