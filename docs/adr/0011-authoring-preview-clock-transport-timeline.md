# ADR-0011: Authoring PreviewClock、Transport 与 CueClip Timeline 边界

- Status: Accepted
- Date: 2026-08-04
- Related Stage: Stage 7.5A
- Extends: ADR-0001、ADR-0003、ADR-0010

## Context

Stage 7 已建立独立 Project、Stage、Effect、Cue、Arrangement revision，以及互相隔离的
Authoring Preview、Rehearsal Snapshot 和 Live Snapshot。确定性的 compiler/evaluator、整数 tick、
TempoMap、TimeSignatureMap、PreviewSession/RenderContext 与 revision pin 都继续成立。

为接入新资产 contract，Stage 7 的作者界面暂时采用了两套能力不对等的实现：Effect Lab/Cues 用首个
tempo point、固定 PPQ=960 和固定 3840 tick loop 推进预览；Arrange 使用最小
`CueTimelinePanel`，固定 48px/quarter-note、每四拍一个 bar，只支持 CueClip 放置、移动和删除。Stage 5/6
的 `TimelinePanel` 仍保存 zoom、adaptive snap、resize、键盘操作、selection inspector、typed automation、
viewport virtualization、DOM-ref preview 和单 transaction Undo，但它绑定 V4 `ShowDocument`、
`EffectInstance` 与 `EffectClip`，不能直接重新接回。

如果分别给三个临时面板增加计时器，作者播放语义会继续漂移；如果直接恢复旧 Timeline，则会破坏
ADR-0010 的 CueClip/revision 所有权。Authoring transport 也不能复用 Live scheduler，因为 workspace
切换、scrub 或 preview 参数修改不得 Publish、Take Live、替换 Live Snapshot 或写入硬件 sink。

## Decision

### 1. 三种 Transport 的所有权

- Live Transport 继续由 Rust monotonic clock、单 scheduler 和 Live Snapshot 拥有，遵循 ADR-0001。
- Rehearsal Transport 继续只读取用户显式捕获的 Draft/Published immutable snapshot，写入 PreviewSink。
- 新增独立的 Authoring Transport。它只控制 Authoring PreviewSession 的 cursor 和 PreviewSink，不调用
  Publish、Take Live、Live transport command 或 OutputSink。
- Lab、Cues、Arrange 使用同一套状态机与命令：`Play`、`Pause`、`Stop`、`Seek`、`SetLoop`、
  `SetClockSource`。重复 Play 幂等；Pause 固定 cursor；Stop 把 cursor 移到 loop start（未启用 loop 时为
  tick 0）并立即重建预览帧；Seek 在原播放状态下重建目标帧。
- workspace mount/unmount 不是 transport command。切换工作区不得隐式 Stop、Seek、Publish 或 Take Live。

### 2. Authoring PreviewClock 状态

每个 Effect revision、Cue revision 和 Arrangement revision 拥有独立 session entry：

```text
AuthoringSession
  scope_key: effect|cue|arrangement + exact asset revision
  playback: stopped | playing | paused
  cursor_tick
  loop: enabled + start_tick + end_tick
  clock_source
    arrangement: exact selected Arrangement session
    local: bpm + numerator + denominator + loop_bars
  runtime_anchor: monotonic_time + anchor_tick  # runtime-only
```

- `cursor_tick`、loop 边界和所有 arrangement 内容继续使用整数 tick。wall-clock seconds、BPM、
  `bar.beat.tick` 都是派生显示，不形成第二个持久化真相。
- Effect/Cue 的 Local BPM、拍号和循环小节只存在于 PreviewSession application state；不得进入
  `EffectDefinition`、`CueDefinition`、Project bundle、Publish closure 或 migration。
- Follow Arrangement 读取所选 Arrangement 的完整 PPQ、TempoMap 与 TimeSignatureMap，并以该
  Arrangement authoring cursor 为时钟锚点。Effect/Cue evaluator 接收同一权威 tick；loop 只改变 session
  cursor，不改写资产。
- Arrange 始终读取自身完整 TempoMap/TimeSignatureMap。tempo 或拍号 point 的 Draft 修改不移动任何
  CueClip/keyframe tick，也不改变 Published/Live revision。
- Playing 位置由 monotonic elapsed time 在 TempoMap 上做分段反解得到；不得按 rAF delta 累加浮点 beat。
  rAF 只决定 UI 发布频率，preview render 可以背压/限频，逻辑 cursor 不补跑历史 frame。

### 3. 音乐时间显示与 ruler

- `current BPM` 取 cursor 所处分段最后一个 tempo point；不能固定取 point 0。
- 拍号的 beat unit 为 `PPQ * 4 / denominator` tick，bar 长度为 `numerator * beat unit`。
- `bar.beat.tick` 从整数 tick 和完整 TimeSignatureMap 派生，使用 1-based bar/beat、0-based tick。
- 每个 time-signature point 开始一个新的 meter segment 和新 bar。若 point 不落在前一拍号的完整 bar
  边界，前一 partial bar 仍计为一个 bar；该规则让任意合法旧文档都有确定显示，不静默移动 point。
- beat/bar meter 按当前 numerator 渲染；bar 首拍与普通 beat 视觉层级不同。
- ruler 只为当前 viewport 加 overscan 生成 bar/beat label；quarter-note grid 使用 CSS pattern 或等价
  常数节点方案，不按 Arrangement 总长度创建节点。非 4/4 和拍号切换处必须从 TimeSignatureMap 生成。

### 4. `ArrangementTimeline` 与命令边界

- 用 production `ArrangementTimeline` 替换 `CueTimelinePanel`。它直接编辑
  `ArrangementDocument -> CueTrack -> CueClip/ArrangementAutomationLane`，不构造、保存或恢复
  `ShowDocument`、`EffectInstance`、`EffectClip`。
- 从成熟 Timeline 提取并复用无所有权的 kernel：`TimelineGeometry`、adaptive snap、viewport
  virtualization、zoom anchoring、PointerEvents capture、DOM-ref/rAF preview、keyboard focus guard、
  selection model 与 curve/keyframe geometry。
- CueClip adapter 提供 place、move、resize、delete、duplicate、nudge、keyboard resize、source offset 和
  selection inspector。automation adapter 解析 CueClip 固定的 Cue revision，再解析 Cue layer 固定的
  Effect revision 与 typed parameter schema。
- typed automation target 在 Arrangement 内仍唯一。continuous 参数默认 linear；discrete 参数强制 hold。
  curve、任意多个 keyframe、box/pointer selection、keyboard move、数值编辑都直接作用于整数 tick contract。
- drag/resize/keyframe pointer move 只更新目标 DOM transform/width 和 snap guide；不得持续写 Zustand、
  Project bundle、React list state 或调用 Tauri。pointer up/cancel 恢复 DOM preview，并最多提交一个
  Arrangement transaction。一次用户操作对应一次 Undo entry。
- playhead 使用独立的轻量 clock subscription 和 DOM ref transform；不得让 60Hz cursor 使整个 Timeline
  React tree 重渲染。

### 5. Diagnostic 与 recovery

- compiler/Tauri 继续使用稳定的 `Diagnostic { code, severity, path, message, hint }`。
- frontend command failure 也规范化为同一 envelope，并可附加不持久化的 recovery action descriptor。
- 失败必须在触发控件、selection inspector 或 Timeline action rail 附近显示 code、原因、影响和可执行
  recovery；Header 只显示去重后的摘要，不再是唯一反馈面。
- fail-closed command 在 validation 通过前不得写 bundle/history；recovery action 也必须调用显式 command，
  不允许自动 Publish、Take Live、升级 revision 或覆盖相邻数据。

### 6. 验证门槛

- 单元：3/4、4/4、拍号切换、多个 tempo point、tick↔monotonic time、bar.beat.tick、loop edge、Stop/Seek。
- 集成：Lab/Cue local/follow、workspace 切换、Arrangement save/reopen、Cue revision pin、Draft/Live isolation。
- Timeline：zoom、snap、move/resize、键盘、selection inspector、typed lane/curve/keyframe、单 transaction
  Undo/Redo，以及 action-local recovery。
- 性能：pointer move 不产生 Project transaction/React list render；1,000 clips viewport 裁剪；playhead
  60fps DOM path；preview render 背压。
- 真实 Tauri：最大化、1440×900、1100×720 下完成 Lab → Cues → Arrange 主路径，并验证多段 TempoMap、
  非 4/4、保存重开、workspace 切换和 Draft/Published/Live 隔离。

## Alternatives considered

1. 复用 Live Transport 作为作者时钟：会把编辑动作引入 Live safety boundary，并使 workspace 切换可能改变
   演出状态。
2. 为 Lab、Cues、Arrange 各写一个 React interval：逻辑时间随 timer 抖动累积，语义和测试继续分裂。
3. 把 Local BPM/拍号写入 Effect/Cue：违反资产所有权；同一 Cue 被不同 Arrangement 复用时会产生两个
   tempo 真相。
4. 直接重新挂载 V4 `TimelinePanel`：会恢复 `EffectInstance/EffectClip/ShowDocument` 所有权，破坏
   revision pin 和独立 Arrangement contract。
5. pointer move 持续提交 store：实现简单但会丢失 60fps gate，并把一次拖拽拆成大量 Undo entry。

## Consequences

- Authoring 播放成为 application/session 能力，不需要新增可发布 schema 字段。
- 前端需要可测试的 TempoMap/TimeSignatureMap 数学与独立 clock subscription；Rust evaluator 保留纯
  `render_at(tick)` 边界。
- 成熟 Timeline 的交互 kernel 会继续复用，但 V4-specific adapter 在迁移完成后保持无调用者，等待
  Stage 7.5E 删除；Stage 7.5A 不进入 LayoutPreset、动态 Targeting 或 Production Catalog。
- Timeline command/history 必须适配独立 Arrangement revision。Published revision 首次编辑仍显式 fork，
  已发布依赖和 Live Snapshot 保持 immutable。

## Migration and rollback

先引入纯音乐时间/clock 与 session contract，再把 Lab/Cues 接到共享控制，最后以 CueClip/automation adapter
替换 Arrange 临时面板。每一步保留 Stage 7 project loader、compiler 和 PreviewSession contract tests。

rollback 按切片回退；Project bundle 不需要 schema downgrade。不得用回滚作为恢复 ShowDocument、自动
Publish/Take Live、首 BPM/fixed 4/4 或 React pointer-move state path 的理由。

## Related commits

- Stage 7 baseline and audit: `646f336`、`411656f`
- ADR and capability parity: `18f864c`
- Authoring clock and transport: `cd90388`、`c5223c5`
- Production ArrangementTimeline: `e8b2bdd`
- Native acceptance: [`stage7-5a-acceptance.md`](../stage7-5a-acceptance.md)
