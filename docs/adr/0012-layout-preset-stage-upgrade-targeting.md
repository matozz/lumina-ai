# ADR-0012: LayoutPreset、Stage Upgrade 与动态 Targeting 边界

- Status: Accepted
- Date: 2026-08-05
- Related Stage: Stage 7.5B、7.5C
- Extends: ADR-0002、ADR-0006、ADR-0010、ADR-0011

## Context

Stage 7 已建立独立、精确 revision 引用的 Project、Stage、Effect、Cue 和 Arrangement，以及互相隔离的
Authoring Preview、Published Project 和 Live Snapshot。Stage 7.5A 又恢复了共享 Authoring Transport 和
production ArrangementTimeline。这些边界继续成立。

当前 Stage 仍把 `LayoutDSL` 内嵌在 `StageDocument`：保存布局等同于修改 Stage，左侧只能显示当前 Stage
的 Group/TargetSet，右侧也只有 matrix rows/columns/spacing。旧 V4 Stage Setup 中已经验证的 circle、
formula、custom、布局表单、Canvas preview 和 Group 编辑能力仍存在，但没有接入 Stage 7 资产路径。

更严重的是，当前 `Apply Stage` 只要发现工程中存在任意 Cue 就直接返回。它既不判断 Cue 是否真正依赖当前
Stage revision，也不展示 topology diff、TargetSet 影响或 recovery action。后端要求 Cue 固定精确 Stage
revision 是正确的；缺少的是显式 upgrade/remap transaction，而不是放松 revision pin。

Stage 7 已有 All、Rows、Columns、R×C Zones、Checkerboard、Fixture IDs 和静态 fixture weight 的 contract，
compiler 也会预计算 membership bitset、fixture index、partition index 和 spatial cache。但产品没有可视化
TargetSet 编辑器，也没有可复用的 TargetingScene 来表达 All → 多分区 → All、hard switch、weighted
transition 和 per-bar 切换。若用播放期间修改 Fixture Group 代替，会重新打开 R-022 并破坏 Seek/Replay。

## Decision

### 1. LayoutPreset 是独立 revision 资产

新增 `LayoutDefinition`，拥有独立 `schema_version`、稳定 ID、单调 revision、display name、分类、editor
capability 和 geometry。`ProjectBundle` 保存 LayoutDefinition 集合；`ProjectManifest.layout_refs[]` 保存所有
可用的精确 layout revision；`StageDocument.layout_ref` 只引用一个精确 `(layout_id, revision)`。

LayoutDefinition 不拥有 Patch、Fixture Profile、Fixture Group、TargetSet、Cue 或 Arrangement。Layout
geometry 只定义坐标拓扑与预览尺寸：

- Basic：matrix、circle、strip/bar、wall、frame；
- Generated/Advanced：formula、SVG path、custom 和声明式 algorithm；
- matrix/wall/strip/frame 将 fixture size、edge gap 和 center-to-center pitch 保存为不同字段；gap 允许为 0，
  validator 要求 pitch 与 size/gap 一致，禁止用含义不明的单一 `spacing` 代替；
- editor capability 为 `form`、`parameter_schema`、`advanced_only` 或 `read_only`。capability 只决定可用编辑
  路径，不改变 geometry 的持久化语义。

保存 Layout Draft、Save As、Duplicate、Rename、Delete 或 Project Publish 都不会自动改写任何 Stage、Cue、
Arrangement、Published revision 或 Live Snapshot。只有显式 `Use on Stage` transaction 可以改变 Stage
引用。

### 2. 旧内嵌布局只通过有报告的 migration 转换

Project bundle contract 升级后保留旧 Project bundle read-only 输入。migration 为每个旧 Stage 的内嵌
`LayoutDSL` 确定性创建默认 LayoutDefinition，并把 Stage 改为精确 `layout_ref`：

- matrix/circle/formula/SVG/custom 的参数和 fixture 顺序原样映射；旧 `spacing`/ring `gap` 迁移为明确的
  fixture size、gap 和 pitch，并在 migration report 中记录默认尺寸；
- Patch fixture ID/profile、Stage ID/revision、坐标结果、Group、TargetSet、Cue 和 Arrangement 引用不得
  丢失或重编号；
- V1–V4 `ShowDocument` importer 直接产生当前 Project + Layout assets，不先生成新的内嵌布局格式；
- migration report 列出新建 Layout ID/revision、Stage ref 改写和所有默认值。无法无损映射时返回 error
  Diagnostic，不静默丢弃。

迁移后格式不降级回内嵌 layout。rollback 继续读取旧格式，但只保存当前独立资产 contract。

### 3. Stage topology diff 与 upgrade transaction

`Use on Stage` 在写 history 之前根据当前 Stage、候选 Layout 和所有精确引用构建纯 impact plan。plan 至少
包含：fixture ID/profile topology、坐标/shape、Group、TargetSet、TargetingScene、直接 Cue 以及通过 CueClip
间接受影响的 Arrangement。

兼容性按以下顺序判断：

1. 候选 Layout 必须能为当前 Patch 的每个 fixture ID 生成且只生成一个有限坐标；
2. fixture ID/profile map 必须保持不变；
3. 所有保留的 Group、TargetSet 和 TargetingScene 必须能在候选 geometry 上重新解析；
4. 只有当已引用 TargetSet 的 fixture membership/partition 语义保持不变时才属于 topology-compatible。

坐标变化本身可以兼容；fixture 缺失/新增、matrix 行列语义变化、selector 失效或 partition 变化属于不兼容。

兼容时，用户可以显式确认一次 transaction：fork 新 Stage revision、改写其 layout ref，并为明确列出的
Cue/Arrangement 创建新 revision 和精确引用。Published bundle 与 Live Snapshot 不变。不得原位改写
Published revision，也不得把 Cue reference 指向 `latest`。

不兼容时只能选择以下显式 recovery：

- 为每个被引用 TargetSet 提供 remap 后创建新的 Stage/Cue/Arrangement revisions；
- 保留旧 Stage revision，不执行 Use on Stage；
- 从候选 Layout 创建独立的新 Stage，旧 Stage 和依赖仍可解析；
- Cancel，且 bundle/history/selection/preview identity 均不改变。

所有 validation 和 command failure 使用 action-local
`Diagnostic { code, severity, path, message, hint }`，并附带影响范围与可执行 recovery descriptor。Header 只
显示去重摘要，不能是唯一错误位置。transaction 在完整 plan 验证通过前 fail closed。

### 4. TargetSet、TargetingScene 与 Spatial Mask 的所有权

Fixture Group 继续表示 Stage revision 内稳定的语义集合，播放期间不可修改。TargetSet 继续属于精确 Stage
revision，并扩展为 All、Rows、Columns、R×C Zones、Checkerboard、Center/Edges、Fixture IDs 和可选静态
fixture weights。TargetSet 的命名、复制、删除保护和引用影响检查都通过 Stage transaction 完成。

`TargetingSceneDefinition` 也属于精确 Stage revision。它是 immutable TargetSet/partition selection 的有序
程序，不拥有 Effect graph、CueClip 或 TempoMap。Cue layer 可以在保留 fallback TargetSet ref 的同时显式
引用同一 Stage revision 的 TargetingScene：

- scene step 选择完整 TargetSet 或一个预编译 partition；
- step duration 使用 beat/bar 音乐单位，边界按 Arrangement PPQ/TimeSignatureMap snap；
- transition 为 hard 或有界 weighted transition；
- phase continuity 表示切换选区时不重启 Effect phase、seed 或 activation order；
- per-bar 通过 bar-duration steps 表达，不修改 Group membership。

Spatial Mask 是编译后的 per-fixture weight，不是可变 Group。静态 TargetSet weights 与 scene transition
weights 相乘后进入 mixer；相同 dependency revisions、tick、seed 和 override 必须得到相同 Frame。

### 5. Compiler 与 render 热路径

schema validation 先于 reference validation，reference validation 先于 geometry/scene compile。compiler：

- 一次性解析 Layout ref 并生成 fixture coordinates、fixture-id index 和 matrix/partition metadata；
- 为每个 TargetSet 预计算 membership bitset、fixture indices、partition indices、spatial sort/cache 和静态
  weights；
- 为每个被引用 TargetingScene 预计算 step boundaries 与按 fixture index 对齐的 selection/transition cache；
- 对 Cue/Arrangement 使用已解析 handle，不在 render 中解析 TargetSet/scene 字符串。

render 热路径只做常数次索引、bitset 检查、step 二分查找和 weight 插值。禁止逐帧 JSON/字符串解析、
`Vec::position` fixture 查找、Group membership 改写、拓扑分配或按 fixture 新建容器。30×30 与至少 1,000
fixtures 的 All → 多分区 → All、随机 Seek/Replay、weighted transition 和多分区并行 60Hz gate 是 release
条件。

### 6. UI 与 Authoring/Live 隔离

Stage 左侧为 Layout Library，Basic 和 Generated/Advanced 使用同一资产列表 contract。Group/TargetSet 移到
当前 Stage inspector 的次级视图。右侧编辑 session-local Layout Draft；每次有效变更立即更新 Authoring
Canvas，但不写 Stage revision。Save Draft/Save As 只写 Layout asset；`Use on Stage` 始终先进入 impact/
remap rail。

TargetSet/TargetingScene preview 写 Authoring PreviewSink，并明确显示当前 selection/partition/weight；它不
Publish、不 Take Live，也不路由到硬件 OutputSink。Stage 工作区切换、预览和 Cancel 不影响 7.5A
AuthoringTransport、ArrangementTimeline、Published bundle 或 Live Snapshot。

## Alternatives considered

1. 继续把 Layout 内嵌在 Stage：无法保存布局库或证明 Save As 不改 Stage，也会让布局发布与 Cue upgrade
   耦合。
2. 保存 Layout 后自动更新所有 Stage/Cue/Arrangement：会静默改写精确 revision，违反 ADR-0010 和
   R-021。
3. 只放松 validator，让旧 Cue 指向新的 Stage：依赖图将看似可用但无法证明 TargetSet membership 语义。
4. 用 fixture count 判断 topology compatibility：相同数量的不同 fixture ID/profile 或 matrix partition
   仍可能破坏 Cue。
5. 播放期间修改 Group membership：Seek/Replay 不可确定，且 render 热路径需要同步可变拓扑。
6. 为 scene 每帧重算空间 selector：实现简单但无法满足 1,000 fixtures/60Hz gate；改为 compile cache。
7. 自动 Publish 或 Take Live 以显示布局/Targeting preview：会把 authoring 行为越过 Live safety boundary。

## Consequences

- Project bundle、manifest、Stage 和 Cue contract 需要显式向前 migration；Effect 与 Arrangement 所有权不变。
- frontend 需要独立 Layout Draft selection、Stage impact plan、remap transaction 和 Targeting editor 状态；每个
  commit 仍是单次 Undo entry。
- project compiler 不再从 Stage 读取内嵌 LayoutDSL，而是解析精确 LayoutDefinition revision。
- V4 Stage Setup 的 circle/formula/custom 表单、custom coordinate editor、Canvas preview 和 Group preview
  会迁入新路径；capability parity、migration 和回归完成前不删除旧 shell。
- Stage 7.5B/7.5C 不修改 Production Effect/Cue Catalog 内容，也不进入 AI、音频或硬件输出。

## Migration and rollback

先增加新 contract 和旧 bundle/ShowDocument migration，再接 compiler/reference validation，然后接 Layout
Library/Draft Preview 与 Use on Stage，最后接 TargetSet/TargetingScene editor 和 runtime。每个切片保留
Stage 7、7.5A、Published/Live isolation 和 save/reopen tests。

任一切片可以通过其增量 commit 回退；已经保存的新 Project bundle 不尝试降级为内嵌 layout。回退版本只
能拒绝新 schema 或由显式 exporter 处理，不能静默丢弃 Layout、TargetSet 或 scene。

## Related commits

- Pending implementation commits on `codex/layout-presets-dynamic-targeting`.
