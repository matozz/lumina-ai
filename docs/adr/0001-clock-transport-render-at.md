# ADR-0001: Clock、Transport 与 `render_at` 边界

- Status: Accepted
- Date: 2026-08-02
- Related Stage: Stage 1

## Context

当前 scheduler 用固定的 `1/subdivision` 推进 beat，每次启动都会新建 OS thread 和 Tokio runtime；重复 Play 会生成多个 worker，Stop 不会 join，Pause 与 Stop 共用命令。渲染又依赖逐 tick 累积的 active phaser、timeline executor 和 parameter context，因此 Seek、Pause/Resume 与顺序播放不能保证得到同一帧。

Stage 1 需要建立可测试、单实例、无累计漂移的实时核心，同时保留前端通过 Tauri events 消费状态与 Frame 的方式。

## Decision

### Clock 与逻辑时间

- 核心只依赖 `Clock::now() -> Duration`。Production 使用以 `Instant` 为原点的 `MonotonicClock`，测试使用可显式 `set`/`advance` 的 `ManualClock`。
- Transport 保存 anchor time、anchor beat 与 BPM；Playing 位置始终由 `anchor_beat + elapsed * bpm / 60` 求出，不做逐 tick beat 累加。
- scheduler 的 wake interval 只决定发布频率，不决定逻辑时间。落后时直接按最新 monotonic time 重算，不补跑历史 tick。
- 首版只接受 30、60、120Hz 三档逻辑输出频率，默认 60Hz。

### Transport

- 单一 Transport 状态机表达 `Stopped/Playing/Paused/Seeking/Error`。
- 重复 Play 返回 `AlreadyPlaying`，不会创建或唤起第二 worker。
- Pause 固定 cursor 并保持最后一帧；Stop 把 cursor 归零并 Blackout；Seek 先发布 `Seeking` revision，再立即在目标时间重建 Frame，随后恢复 Playing 或进入 Paused。
- 每次可观察状态、cursor 或 tempo 变化递增 transport revision；所有前端状态由单一 `engine:state-change` payload 发布。

### Scheduler 生命周期

- scheduler 是一个由 async `JoinHandle` 和取消信号管理的 Tokio task；Start/Stop/Shutdown 必须串行修改 handle。
- Stop 在返回前取消并 await worker；app shutdown 复用同一条 shutdown 路径。
- worker 不创建嵌套 runtime、不使用 OS spin-loop，也不在持有 Engine runtime 锁时读取 show snapshot 或 emit event。

### Renderer 与 Snapshot

- renderer 暴露纯 `render_at(RenderTime)` 边界，输入为 immutable `Arc<CompiledShow>` revision、时间和一次性 live override snapshot，输出完整逻辑 Frame。
- Timeline active clips、automation 与 phaser phase 由目标时间重建；不依赖上一个 tick 的临时列表。相同 snapshot 与时间必须得到完全相同的输出。
- compile 在锁外完成；成功后用短写锁原子替换 `{ revision, Arc<CompiledShow> }`。runtime 与 show snapshot 禁止嵌套持锁。

### Frame 发布

- publisher 维护上一完整 Frame，但 diff 按 fixture ID 比较。
- 首帧、show revision 变化、fixture topology 变化或显式 resync 必须发布 full frame。
- payload 携带 `show_revision`、单调 `frame_sequence`、逻辑 beat/time 与 `full`；前端可据此检测 revision、丢帧和乱序。

## Alternatives considered

1. 继续用固定 delta tick，并在落后时补 tick：会把 scheduler 抖动永久积累到逻辑时间，无法满足 10 分钟漂移和 Seek 等价要求。
2. 每次 Seek 从 0 快进可变 runtime：实现简单但复杂度随歌曲长度增长，且仍依赖逐 tick 步长。
3. 用多个 worker 分离 timeline、phaser 和 output：增加锁顺序、取消和 revision 协调难度，不符合当前单进程规模。
4. 让前端持有 Transport 真值：会破坏 Rust backend 作为演出状态权威的既有约束。

## Consequences

- timeline automation，尤其 multiplier，需要可按目标时间求值或积分；旧 `accumulated_beat` 将被移除。
- scheduler 测试可用 ManualClock 在无真实等待的情况下验证 10 分钟逻辑时间、Pause/Resume 和 Seek。
- Tauri command 与 event payload 会变更，前端 bridge 和 ControlPanel 必须同阶段迁移。
- output adapter 尚未在 Stage 1 引入；shutdown hook 先确保 scheduler worker 完整退出。

## Migration and rollback

迁移按可验证切片进行：先加入 Clock/Transport 核心，再迁移纯 renderer、Frame publisher、scheduler 生命周期和前端 commands/events。每个切片保留旧 contract tests，直到对应新语义测试替换它。若某切片回滚，回退该切片 commit 即可；不得同时保留两个可启动 worker 的实现。

## Related commits

- Stage 0 characterization: `ac547bc`
- Clock/Transport core: 本切片提交
