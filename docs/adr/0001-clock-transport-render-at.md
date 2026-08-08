# ADR-0001: Clock、Transport 与 `render_at` 边界

- Status: Accepted
- Date: 2026-08-02
- Amended: 2026-08-08 for Authoring V1 terminology

## Context

实时播放、任意 Seek 和顺序播放必须在相同输入下得到同一逻辑帧。scheduler wake 抖动不能累计为音乐时间漂移，重复 Play 也不能创建多个 worker。

## Decision

- 核心只依赖 `Clock::now() -> Duration`。Production 使用 monotonic clock，测试使用可控制的 manual clock。
- Transport 保存 anchor time、anchor position 与 BPM；playing cursor 从 elapsed time 推导，不按 wake tick 累加。
- 单一状态机表达 stopped、playing、paused、seeking 和 error。重复 Play 幂等；Pause 固定 cursor；Stop 归零并 blackout；Seek 立即在目标时间重建 Frame。
- scheduler 是一个由 Tokio `JoinHandle` 和取消信号管理的 worker。Stop/Shutdown 必须取消并 await；禁止嵌套 runtime、spin loop 或持锁 emit。
- renderer 暴露纯 `render_at(RenderTime)`，输入 immutable compiled snapshot、时间与 overrides，输出完整 typed Frame。active clips、automation 与 Effect phase 都从目标时间计算。
- compile 在 engine runtime 锁外完成，成功后用短写锁原子替换 snapshot。runtime 与 snapshot 不嵌套持锁。
- Frame diff 按 fixture ID 比较；首帧、snapshot/topology 变化和显式 resync 发布 full frame。

## Consequences

- Wake interval 只决定发布频率，不决定逻辑时间；落后时按当前 monotonic time 求值，不补跑历史 frame。
- Preview 与输出 sink 消费同一逻辑 Frame，不维护第二套可回写状态。
- Seek、Replay、暂停恢复和长期 TempoMap 测试是引擎变更的固定门槛。
