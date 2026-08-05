# ADR-0013: Production Effect/Cue Catalog、Safe Authoring 与配置验证边界

- Status: Accepted
- Date: 2026-08-05
- Related Stage: Stage 7.5D
- Extends: ADR-0004、ADR-0005、ADR-0006、ADR-0010、ADR-0011、ADR-0012

## Context

Stage 7 已将 Stage、Effect、Cue 与 Arrangement 拆为固定 revision 的独立资产；Stage 7.5A–C 又建立了
AuthoringTransport、LayoutDefinition、TargetSet、TargetingScene 和显式 Stage dependency upgrade。当前
Effect/Cue runtime 边界正确，但作者路径和内容仍是临时实现：

- Effect Library 同时提供 Pulse/Gradient 快捷按钮、Create 入口和资产列表；内置内容与 Project Draft 没有
  清晰的只读/fork 关系。
- Effect Lab 只编辑名称和 speed。旧 V4 表单按固定参数集合工作，不能证明 UI 由 pinned Effect revision 的
  parameter schema 驱动。
- Cue Builder 连续展开所有 layer，每次 blur/select 直接写 Project transaction；非法临时文本、完整 Save
  validation、preview last-known-good 和 field recovery 没有共同边界。
- 18 个历史 Raw DSL template 共包含 43 个 target-bound legacy Effect。它们全部使用近似相同的
  `time → spatial_phase(index) → step_sequence → attribute_writer` 图，Catalog metadata 几乎都标为
  `motion=pulse`、`strobe_risk=none`，不能作为 Production Catalog 的可信来源。
- Project validator 已覆盖精确 reference、Stage capability、typed override 和 musical speed，但没有完整验证
  parameter schema 自身、graph output 可达性、Catalog metadata、sampled output 或 Production Cue recipe。

Stage 7.5D 必须补齐这些能力，但不得恢复 target-bound EffectInstance 所有权、把 Stage 写入 Effect、放松精确
revision、重用 Live transport 做预览，或提前进入 Stage 7.5E 的全产品 release closure。

## Decision

### 1. Catalog、Project Draft 与 immutable revision

Production Catalog 使用版本化、随应用发布的 `built_in` EffectDefinition。每个内置 Effect 具有稳定 ID、正
revision、确定性 graph、完整 parameter schema 和 Catalog metadata。Project bundle 可以保存这些精确定义与
manifest ref，compiler 仍通过 ADR-0010 的普通 exact asset resolver 解析，不增加 `latest` 或隐式网络目录。

内置 revision 在产品 UI 和 Project command 层只读。`Customize` 是其唯一主要编辑入口，并执行显式 fork：

1. 复制所选内置 revision；
2. 分配独立 Project-local ID，revision 从 1 开始，`source=project_local`；
3. 保留来源 provenance，但后续 revision 不再跟随内置更新；
4. 选择新 Project Draft，在 Authoring Preview 中继续编辑。

Project Effect/Cue 的每次成功 `Save` 都创建新的 immutable revision；旧 revision、既有 Cue、Arrangement、
Published Project 与 Live Snapshot 不变。升级 Cue 中的 Effect ref、升级 Arrangement 中的 Cue ref 都是另一个
显式 transaction。Duplicate、Save As、Delete、metadata 和 revision upgrade 属于次级菜单或 Advanced 区域。

弃用内置 Effect 时保留可解析 revision，将 visibility 改为 hidden/deprecated，并声明可选的精确 replacement
ref 和 migration note。不得删除仍被 schema、migration、golden、Project 或 compatibility fixture 消费的
revision。

### 2. target-agnostic Effect 与 Stage-bound Cue

EffectDefinition 继续只拥有 graph、parameter schema 和 Catalog/risk/capability metadata，不引用 Stage、
Layout、Fixture、Group、TargetSet 或 TargetingScene。

CueDefinition 继续固定一个 compatible Stage revision。Production Cue recipe 不是可变 Cue 资产，而是稳定、
版本化的解析配方：它按 Effect exact ref、required attribute、layout capability 和 Target role 描述 layer。在
用户选择 active Stage 后，resolver 必须：

1. 枚举该 Stage revision 的 Layout capability、TargetSet 和 TargetingScene；
2. 按 selector/partition/scene capability 匹配，不按示例 ID 或 display name 匹配；
3. 返回完整 impact/Diagnostic；能力不足时不创建 Cue，并提供 remap/choose-target recovery；
4. 成功时生成固定 Stage、Effect、TargetSet/TargetingScene revision 的新 Project Cue revision。

recipe 和生成后的 Cue 都不得硬编码 `main-stage`、`all`、`zones-3x3` 等 starter identity。

### 3. Schema-driven parameter authoring

Effect 参数编辑器只读取 pinned Effect revision 的 parameter schema，不按 Effect ID/name 分支。Production
parameter 除 value type/default/range/unit/UI hint/automation 外，还声明 step、required、简短 help、safe
fallback、override policy、Advanced visibility 和可选的 typed graph binding。

支持 scalar、color、direction、boolean、enum 和 color-stops。waveform 使用受限 enum；beat-synced speed 继续
只接受 0.25×、0.5×、1×、2×、4×、8×。graph binding 只能引用已存在 node 和受支持的 typed property，用于
Effect-only 的 waveform、attack/release、color stops 等结构参数；Cue override 只允许 schema 明确标为
overridable 的 runtime 参数。不得以 Effect 名称硬编码 graph rewrite。

旧 Effect parameter 缺少新增 authoring metadata 时仍可读取，但只能进入 legacy/Advanced 路径；Production
Catalog validator 要求完整字段。删除或改名参数前必须解析 Cue/Arrangement automation dependency，并显示
impact；不得静默删除 override 或 keyframe。

### 4. Protected Draft transaction 与恢复

Effect/Cue 编辑使用 session-local working draft。输入事件只更新 working draft 和字段诊断，不写 Project
bundle/history。简单 normalization（例如去除 name 首尾空白、颜色大写归一）必须在字段旁显示；任何改变语义
的 clamp、replacement 或 override 删除都禁止自动执行。

预览采用 candidate bundle：只在 schema、semantic、reference、capability 和 preview compile 均成功后替换
PreviewSession。失败时保留 working draft、当前 Project/Published/Live、transport 和 Canvas last-known-good
frame。单个资产失败不得清空 Canvas 或停止其他 workspace transport。

Save 复用同一 validation pipeline。完整通过后一次性追加 Effect/Cue revision、manifest ref 和一个 Undo entry；
失败不写 bundle/history。恢复操作是上下文相关的显式 command：Reset field、Restore safe default、Revert to
last valid revision、Save As new Draft、Remove incompatible override，以及 legacy asset 的 migrate/revert/
duplicate-safe-copy。不可逆删除继续需要确认。

A/B preview 同时固定 Stage、TargetSet、tick、seed、clock source 和 AuthoringTransport，只改变 A/B 的 exact
Effect/Cue revision。A/B 不 Publish、不 Take Live、不修改持久化 transport。Advanced Graph 只显示 graph
summary 与 Diagnostic，不提供任意节点编辑。

Preview-only mute/solo 保存于 Cue PreviewSession；只有用户显式选择持久化时才进入新的 Cue revision。

### 5. 统一 Catalog validation

Rust authority 提供统一 validator 和 CLI/project check 入口，覆盖内置 Effect、Cue recipe 和 Project Draft。
顺序固定为：

1. JSON/schema；
2. identity/revision/reference；
3. parameter schema、default、fallback、override/automation；
4. typed graph、cycle、missing/unreachable output；
5. Catalog metadata 与 graph/capability；
6. Stage/TargetSet/TargetingScene compatibility；
7. preview compile；
8. sampled output、determinism、musical meter/loop 和 persistence/migration consistency。

sampled output 至少检测非预期全黑、全程静止、恒定/无效参数、重复 Effect 输出、参数变化无可见影响，以及
strobe metadata 与实际变化频率不符。所有 Production assets 必须零 error；warning 只允许出现在版本化 allowlist
中，且每项包含 code、asset identity、原因和 owner。

Diagnostic 保留稳定 `code/severity/path/message/hint`，并允许附加 asset ID/revision 与 session-only recovery
descriptor。旧 consumer 可忽略新增字段。Publish/Take Live 必须重新验证选中 dependency closure，不能依赖
作者界面曾经成功预览。

统一 command 的稳定、排序后 capability 输出是 Stage 8 query 的唯一 Production Catalog 输入；不得让 Stage 8
读取 UI label、React state 或 template 文件名推断能力。

### 6. UI 主路径与视觉层级

主要路径固定为：

`Production Catalog → Preview → Customize → Save Effect → Add to Cue → Preview Cue → Save Cue`

Effect Catalog 区分 Production 与 Project Draft，但使用一个列表 contract。内置 Effect 主要操作为
`Customize`；Project working draft 主要操作为 `Save Effect`。Cue Builder 使用 layer list、selected-layer
editor 和确定性 Cue summary；reorder、duplicate、delete、mute/solo 只在 selection/context 中出现。默认区只
显示常用参数，风险、capability、metadata、完整参数和 graph diagnostic 渐进展开。

成功保存使用非阻塞局部状态，不弹阻塞 Dialog。错误、风险、accessible label、focus path 和不可逆确认不因
界面简化而删除。每个 pane 只有一个语义明确的主要操作。

## Alternatives considered

1. 直接把 Production Effect 复制成 18 个 Raw DSL template：template 仍拥有 Stage/Group/Instance，无法形成
   target-agnostic Catalog，也不能保证 metadata 或输出差异。
2. 在首次选择时原位修改 `built_in` revision：会让同一 ID/revision 在不同 Project 中含义不同，破坏 Cue pin、
   golden 和 Stage 8 capability query。
3. 每次 input/onBlur 直接写 Project，再依赖 Undo 恢复：非法中间态会进入 bundle/history，preview compile
   失败也无法维持 last-known-good。
4. 只在 React 中校验：Publish、migration、Raw asset 和 Stage 8 query 可以绕过 UI；Rust authority 与统一 CLI
   gate 仍是必须项。
5. 以 catch 后继续渲染旧 frame 作为恢复：隐藏了资产错误且没有 field/path/recovery；last-known-good 必须与
   可见 Diagnostic 和明确修复动作共同存在。
6. 为 Stage 7.5D 实现任意节点编辑器：扩大 typed graph surface，且超出当前用户路径；只保留 summary/
   diagnostic。

## Consequences

- Effect/Cue authoring 从即时 Project mutation 改为 session-local draft + validated Save transaction。
- schema/Rust/generated TypeScript/catalog JSON/validator 必须同步演进；旧 revision 通过默认/legacy 路径继续读。
- Production Catalog 会增加 bundle/migration 体积，但保留现有 exact resolver，不引入在线 Marketplace 或新资产
  所有权。
- Cue summary 不再信任手写 metadata；validator 根据实际 layer dependency 确定性重算并拒绝漂移。
- PreviewSession 需要记录 last-known-good identity 和 A/B/preview mute-solo session state，但这些字段不进入
  Project、Publish closure 或 Live Snapshot。
- 7.5D 可以执行 scoped golden、compatibility、30×30 和 native authoring 验收；不据此宣告 7.5E 全链路
  release closure 完成。

## Migration and rollback

先提交 ADR/audit，再扩展向后兼容的 parameter/catalog contract 与统一 validator；随后加入内置 Effect/Cue
recipe、safe draft commands 和 UI，最后建立 golden/native evidence。每个切片保持旧 Project/Show importer、
Published/Live isolation 和 Stage 7.5A–C tests。

旧 bundle 在 load migration 中确定性补齐缺失的内置 Catalog exact revisions；既有 project-local asset 内容和
ref 不被重写。旧 parameter 缺少 Production metadata 时只标为 legacy，不猜测 help/fallback/binding。回滚可以
继续读取旧 bundle 和旧模板，但不能把已保存的新 parameter value type 或 Catalog metadata 静默降级；需要显式
export/loss report。

## Related commits

- Stage 7 asset boundary: `61c150b`、`040e44b`、`9e67d53`
- Stage 7.5A authoring transport: `18f864c`、`cd90388`、`e8b2bdd`
- Stage 7.5B/C layout and targeting: `8402091`、`0c79132`、`871b6cb`
- Stage 7.5D implementation: pending
