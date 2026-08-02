# ADR-0006: Draft、Published Revision 与 Live Snapshot

- Status: Accepted
- Date: 2026-08-02
- Related Stage: Stage 6

## Context

Stage 5 基线的 `load_dsl` 在编译成功后立即替换 scheduler 读取的唯一 `ShowSnapshot`，并清空
active phaser。Raw DSL 和任何视觉编辑器的热编译因此都可能静默改变正在播放的 show，对应 R-005。

Stage 6 需要让用户持续编辑 Draft、保存可引用的 Published Revision，并在明确操作后才把某个
revision 设为当前 Live Snapshot。三个状态必须共享同一编译器和确定性 runtime，但生命周期不能
合并。

## Decision

- `ShowStore` 保存单调递增、不可变的 compiled snapshot 集合，并分别记录
  `latest_published_revision` 与 `live_revision`。
- `publish_dsl` 只验证、编译并发布新 revision；它不替换 `live_revision`，也不清除 Live override。
- `activate_show_revision` 是唯一把已发布 revision 设为 Live Snapshot 的新命令；操作成功后清除
  与旧 snapshot 绑定的 live phaser，避免悬空 effect ID。
- scheduler、Canvas Preview 和 OutputSink 继续只读取 `live_revision` 指向的同一 immutable
  `Arc<CompiledShow>`。发布 Draft 时播放中的 worker 不需要重启，也不会看到新 revision。
- `load_dsl` 暂时保留为冷启动/向后兼容入口，内部执行 publish + activate；Stage 6 普通编辑路径
  不再用它做热编译。
- Effect revision 在 Draft 中原位递增；旧 Live Snapshot 已持有旧 compiled graph，不依赖 Draft
  文档继续保存重复 definition ID。

## Alternatives considered

1. 播放时禁止编辑：无法支持排练中准备下一版，也没有解决 Pause 状态和 Raw DSL 热编译边界。
2. 每次 Draft 编译都替换 Live，再用 Undo 恢复：会产生可见输出跳变，Undo 也不是演出安全机制。
3. 为 Draft 和 Live 各启动一套 scheduler：增加时钟、锁和输出路由分歧，破坏单一 Transport。
4. 只在前端记 revision：后端仍只有可被覆盖的 snapshot，无法形成可信安全边界。

## Consequences

- Workspace Shell 必须同时展示 Draft dirty、最新 Published Revision 和当前 Live Snapshot，并提供
  分开的 Publish 与 Take Live 操作。
- Draft loop preview 需要独立的 preview-only 渲染路径；不得借用 `activate_show_revision` 静默改变
  Live。
- 当前 session 会保留已发布 snapshot 以支持回滚。长期工程文件只保存用户文档；compiled snapshot
  可在重新打开工程时确定性重建。
- Stage 7 的 Audio/TempoMap 文档变化沿用同一发布边界，歌曲校正不会在用户确认前影响 Live。

## Migration and rollback

既有 `load_dsl` 的行为保持兼容，模板和旧启动路径无需同步迁移。新 UI 逐步切换到
`publish_dsl`/`activate_show_revision`。若回滚本决策，删除新增命令并恢复单一 current snapshot；
但在此之前必须同时恢复禁止 Live 编辑的产品约束，否则 R-005 会重新打开。

## Related commits

- Draft/Published/Live backend contract: 本切片提交
