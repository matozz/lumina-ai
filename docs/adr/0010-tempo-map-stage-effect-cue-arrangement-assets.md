# ADR-0010: TempoMap 与 Stage、Effect、Cue、Arrangement 资产边界

- Status: Accepted
- Date: 2026-08-03
- Related Stage: Stage 7
- Supersedes: ADR-0006 中 Canvas 只读取 Live revision 的预览限制；ADR-0007 的全部音频产品方向

## Context

Stage 6 的 `ShowDocumentV4` 把 Patch、Layout、Fixture Group、EffectDefinition、绑定目标的
EffectInstance、TempoMap 和 Timeline 放在同一份文档中。Effect revision 虽然存在，但 Timeline 仍引用
全局 EffectInstance；工程无法独立发布 Stage、Cue 或多个 Arrangement，也无法证明引用的 revision 没有被
静默替换。

Stage 5 已经建立 PPQ、整数 `MusicalTime`、多段 TempoMap、确定性 `render_at`、Seek/Replay、Loop、
typed automation 和单 transaction Undo/Redo。这些是 Arrangement 的时钟和编辑能力，不是音频能力，
Stage 7 必须原样保留。Lumina 不导入、播放或分析音频，不显示波形，也不维护 sample position、
SongAnalysis 或 A/V 校准。

2026-08-03 在 `main@aa14242` 上进行的真实 Tauri 基线走查还发现：

- Effect Lab 可以渲染 Draft loop，但 preview 的 Play/Pause 状态在离开工作区后重置。
- Arrange 的 Draft clip 在 Seek 后不出现在 Canvas；必须 Publish 并 Take Live 才能看到结果。
- Rehearse 没有 Draft/Published 来源选择，只能读取当前 Live revision。
- Stage Draft 从 4×4 改为 5×5 后，未 Publish/Take Live 的 Live Canvas 也显示 5×5。原因是 Canvas
  复用了前一工作区的 Draft layout，同时消费 Live frame，视觉上的 Live Snapshot 隔离失效。
- Arrangement playhead、Effect 选择和真实 rehearsal transport 能跨工作区保持，应该保留这一行为。

因此资产拆分和预览边界必须一起完成。只拆 schema 而继续让 Canvas 读取隐式全局状态，仍会迫使用户
切换工作区或污染 Live；只增加一条 Draft preview 命令而不固定 revision graph，也无法得到可复现输出。

## Decision

### 1. 持久化资产与所有权

所有持久化资产都使用独立 schema、稳定 ID 和单调递增 revision。`(asset_id, revision)` 指向不可变
内容；编辑发生在 Draft working copy，发布产生新 revision，不原位改写已发布内容。display name 不是
identity。

`ProjectManifest` 只拥有工程索引和当前选择：

```text
ProjectManifest
  schema_version / project_id / revision / name
  stage_ref
  effect_refs[]
  cue_refs[]
  arrangement_refs[]
  active_arrangement_id
```

`StageDocument` 独占 Fixture Profile reference、Patch、Layout、Fixture Group 和 TargetSet。Stage 不保存
EffectGraph、Cue layer、CueClip、TempoMap 或 automation。

`EffectDefinition` 独占 target-agnostic graph、parameter schema/default、capability、catalog 和 risk
metadata。Effect 不引用具体 Stage、Fixture Group、TargetSet、Cue 或 Arrangement，也不包含 Timeline。

`CueDefinition` 独占可触发的多层组合。每个 layer 固定引用一个 Effect revision 和一个属于固定 Stage
revision 的 TargetSet，并保存 parameter override、phase、seed、layer/priority、mix override 与 trigger
policy。Cue 可以有 nominal length 和 cue-local automation，但不拥有 TempoMap。更新 Effect 必须由显式
“upgrade reference”命令产生新的 Cue revision；不得静默改变既有 Cue。

`ArrangementDocument` 独占 PPQ、TempoMap、拍号、长度、CueClip tracks、typed automation 和人工
marker。CueClip 固定引用 Cue revision，只允许 schema 白名单中的实例 override。Arrangement 不内嵌
Layout、EffectGraph、EffectDefinition 或 CueDefinition，也不直接引用 EffectInstance。

Project 的存储实现可以暂时使用一个 bundle/container，但 bundle 只是传输和原子保存封装。bundle 内每个
文档仍独立带 schema/version/identity，manifest 只以 reference 连接它们；任何 consumer 都不得把 bundle
当作新的单体 ShowDocument。

### 2. Reference 与 revision 规则

- 通用 `AssetRef` 至少包含 `id` 和 `revision`，revision 不能省略或使用“latest”。
- `TargetSetRef` 包含 `stage_id`、`stage_revision` 和 `target_set_id`。TargetSet identity 在同一 Stage
  revision 内唯一。
- Cue 的 compatible Stage 是精确 revision。Stage 改变 fixture topology、group 或 TargetSet 后，旧 Cue
  保持引用旧 Stage revision，直到显式升级并重新验证。
- Arrangement 的 CueClip 只引用 Cue `(id, revision)`；Cue 再传递依赖到固定 Effect/Stage revision。
- manifest 中同一 asset ID/revision 只能出现一次。重复 ID、缺失 reference、revision 不匹配、循环依赖
  和 capability 不匹配都返回结构化 `Diagnostic { code, severity, path, message, hint }`。
- Draft reference 只存在于编辑 session，不写成可发布的隐式 `latest` reference。Publish 必须把整个依赖
  closure 固定为精确 revision。

### 3. TargetSet 与运行时边界

Fixture Group 是 Stage revision 内的静态语义集合。TargetSet 是可被 Cue 引用的确定性空间选区，Stage 7
至少支持 All、Rows、Columns、R×C Zones、Checkerboard 和显式 fixture IDs；Odd/Even、Center/Edges
可以使用同一 tagged contract 扩展。

compiler 在解析 Stage 时生成：

- 按 fixture handle 排列的 bitset；
- 稳定 fixture index 列表；
- row、column、zone 和 partition index；
- Effect spatial phase 所需的排序/坐标 cache。

render 热路径只遍历预计算 index/bitset，不以字符串解析目标，不执行 `Vec::position`，也不在播放中修改
Group membership。连续边界变化使用显式 fixture weight/Spatial Mask；Stage 7 只建立 contract 和最小
求值，完整动态编辑器留给 Stage 7.5。

### 4. Authoring Preview、Rehearsal Snapshot 与 Live Snapshot

三种运行上下文共享同一个 deterministic compiler/evaluator，但 snapshot 和 output sink 完全分离：

| Context            | 输入                                                                 | 生命周期                        | Sink                           | 是否能改变 Live |
| ------------------ | -------------------------------------------------------------------- | ------------------------------- | ------------------------------ | --------------- |
| Authoring Preview  | 当前 Draft、选择对象、authoring playhead                             | 编辑 session 内可重编译         | PreviewSink                    | 永不            |
| Rehearsal Snapshot | 用户显式选择 Draft 或 Published revision 后捕获的 immutable snapshot | 直到用户重建 rehearsal snapshot | Rehearsal/PreviewSink          | 永不            |
| Live Snapshot      | 显式 Take Live 的 Published dependency closure                       | 直到下一次 Take Live/rollback   | Live OutputSink + Live monitor | 只能显式操作    |

`PreviewSession` 是独立于 React 工作区组件生命周期的应用状态，至少保存：

- preview source/mode；
- selected Stage/Effect/Cue/Arrangement IDs；
- 每个 Arrangement 的 authoring playhead 与 loop；
- Effect/Cue loop preview 的 play/pause、scrub 和 A/B revision；
- rehearsal source、snapshot identity 和 transport；
- compile generation、diagnostics 和最后一帧 identity。

`RenderContext` 显式描述 `context kind + immutable compiled snapshot + selected asset + tick + seed + sink`。
Stage、Effect、Cue 和 Arrangement Canvas 必须根据当前编辑 context 获取匹配的 layout 与 frame，并在
context identity 变化时原子替换二者。Canvas 不得复用上一工作区 layout，也不得把 Draft layout 与 Live
frame 组合。

Authoring Preview 通过 preview-only compile/render command 或等价的本地 deterministic evaluator 更新，
禁止调用 Take Live、禁止替换 `live_revision`，也禁止把 PreviewSink 路由到硬件 OutputSink。Live scheduler
继续只读取 Live Snapshot。Rehearsal 可以运行自己的 preview transport，但不得清除或重置 Live override。

### 5. 工作区与状态保持

一级工作区固定为 `Stage | Effect Lab | Cues | Arrange | Live / Rehearse`，Advanced 是查看独立资产的
辅助入口，不是单体 DSL 的所有权入口。

切换工作区只改变可见 RenderContext，不隐式调用 `setSequencerMode`、Stop、Seek、Publish 或 Take Live：

- 当前 Stage/Effect/Cue/Arrangement 选择保持；
- 每个 Arrangement 的 authoring playhead/loop 保持，切回后恢复；
- Effect/Cue preview 的 pause/scrub/A-B mode 保持；
- rehearsal 和 Live transport 若在运行则继续运行；
- Live Snapshot、Blackout 和 Live Pad 状态不受 authoring workspace 切换影响。

选择另一个 Arrangement 时，先保存当前 Arrangement 的 session playhead，再恢复目标 Arrangement 的
session playhead；TempoMap 改动不重写任何 clip/keyframe tick。UI 可以重新计算 seconds 显示，但 tick 是
唯一持久化位置。

### 6. 编译与 snapshot 边界

新的主编译入口接收 Project bundle/asset resolver 和选中 Arrangement ref，按以下顺序构建不可变依赖图：

```text
manifest → Stage revision → referenced Effect revisions
         → referenced Cue revisions → selected Arrangement revision
         → validated dependency closure → CompiledProjectSnapshot
```

schema validation 先于 reference validation；reference validation 先于 capability/graph compile。diagnostic
路径必须定位到所属 asset 和字段。graph 使用稳定拓扑顺序；即使当前 schema 只有 Stage→Cue、Effect→Cue、
Cue→Arrangement 的有向边，也必须以通用 visiting/visited 检查循环，防止未来扩展绕过边界。

compiler 产生 resolved handles、TargetSet cache、Cue layer route、automation index、TempoMap 和 mixer route。
evaluator 对相同 dependency revisions、tick、seed 和 override 返回相同 logical Frame。Authoring、Rehearsal
和 Live 都调用这一 evaluator；差异只在 snapshot identity、transport 和 sink。

### 7. Publish 与 Live

Publish 验证并冻结 Project dependency closure，生成 Published Project Revision；不改变 Live。Take Live
是唯一把一个 Published Project Revision 设为 Live Snapshot 的操作，并记录 manifest、Stage、所有被引用
Effect/Cue 和 Arrangement 的精确 revision。

发布后继续修改 Draft 不会改变 Published/Rehearsal/Live snapshot。回滚 Live 只允许选择已发布且仍可解析
的 immutable closure。compiled IR 可以在 session 内缓存；持久化真相仍是独立资产 revision。

## Migration and rollback

V1–V4 `ShowDocument` 只作为显式 import 输入，确定性迁移为一个 Project bundle：

1. 创建 `default-stage`，迁移 Patch、Layout 和 Fixture Group；为每个旧 group 生成等价 TargetSet，并生成
   All TargetSet。
2. 每个旧 EffectDefinition 保留稳定 ID/revision 和 graph；删除其目标所有权。
3. 每个旧 EffectInstance 生成一个稳定 Cue：layer 固定原 definition revision、由原 target group 迁移的
   TargetSet、parameter overrides 和 seed。旧 instance ID 通过确定性规则映射到 Cue ID。
4. 创建 `default-arrangement`，原 V4 `timeline.ppq`、全部 tempo point、clip/keyframe tick、overlap、loop、
   source offset 和 automation 原样迁移；缺失拍号补 tick 0 的 4/4；长度取显式配置或内容最大 end tick。
5. EffectClip 转为引用对应 Cue revision 的 CueClip。automation target 显式改写为 Cue layer parameter ref；
   无法无损映射时返回 error diagnostic，不静默丢弃。
6. 迁移报告列出新建资产、ID mapping、默认拍号/长度和所有需要用户确认的变更。

迁移不读取未发布的 V5 Audio/Song 实验，也不引入 AudioAsset、SongAnalysis、waveform cache、sample
position 或音频依赖。若未来必须读取外部实际发布的 V5，另行 ADR 和显式 loss report，不在 Stage 7
预先加入 runtime。

Stage 7 保存格式不能无损降级回单体 V4；rollback 只能保留 V1–V4 read-only importer，并在功能回滚时
继续保存独立资产，不能静默合并回巨型 JSON。

## Alternatives considered

1. 继续扩展 ShowDocumentV5：revision 和引用仍是文档内局部字段，多 Arrangement 会复制 Stage/Effect，
   无法形成真实资产边界。
2. Preview 自动 Publish + Take Live：会把编辑动作变成演出状态变化，重新打开 R-005，明确禁止。
3. 为每个工作区实现不同 evaluator：Canvas、Rehearsal 和 Live 会产生语义漂移，确定性无法证明。
4. Cue 引用 Effect `latest`：方便编辑但会静默改变已发布 Cue/Arrangement，违反 R-021。
5. 播放期间动态修改 Fixture Group：破坏 Seek/Replay；改用 immutable TargetSet 和显式 Spatial Mask。
6. 把 TempoMap 移除为“音频残留”：会破坏 Stage 5 的音乐时间能力。TempoMap 明确属于 Arrangement。

## Consequences

- Stage 7 会新增独立 schema/generated TypeScript artifacts、reference validator、project compiler、migration
  report 和 PreviewSession 状态机。
- 当前 EffectInstance 将退出公共资产 contract；其职责迁移到 Cue layer。单 Effect placement 只通过
  Advanced 创建受控的单层 Cue，不重新引入全局 target-bound instance。
- Canvas 必须接收带 context/snapshot identity 的 layout/frame，不再依赖无作用域的 window event。
- Project save/open 从单个 DSL 字符串变为独立资产 bundle 的原子持久化；Raw DSL 只能按资产查看/编辑。
- schema、reference、revision pin、migration、随机 Seek、多段 TempoMap 长时、30×30 TargetSet 和 preview/
  live 状态机测试成为 Stage 7 release gate。
- Production Effect Catalog、AI 编排、音频、真实硬件输出和完整动态 TargetSet 编辑器不在本 ADR 的实现
  范围内。

## Related commits

- ADR and Stage 7 baseline: `61c150b`
- Independent asset schemas and references: `040e44b`
- Cue compiler and precomputed TargetSet caches: `9e67d53`
- Preview/revision snapshots and V1–V4 migration: `8087071`
- Cue-first authoring workspaces: `004fca4`
- Native preview performance and Live catalog isolation: `9de1301`

## Implementation evidence

- Draft Authoring Preview、Draft/Published Rehearsal 与 Live Snapshot 复用同一 project compiler/evaluator，分别写入 preview sink 与 immutable live sink；Preview 不调用 Publish/Take Live。
- 30×30 All→3×3 Zones→All、100 次随机 Seek/Replay、Effect revision pin、多 Arrangement TempoMap 与 30 分钟分段 tempo 均有确定性测试。
- V1–V4 显式迁移为默认 Stage/Effect/Cue/Arrangement；当前基线没有已发布 V5，因此未引入 Audio/Song loss runtime。
- 最终 `pnpm check:all`、`pnpm build`、101 Rust unit、12 integration/contracts、116 frontend tests 与真实 Tauri 最大化/1440×900/1100×720 路径通过。
- 原生验收证据：[`../evidence/stage7-tempo-cue-arrangement/`](../evidence/stage7-tempo-cue-arrangement/README.md)。
