# TargetSets 与 Cues

## TargetSet 属于 Stage

TargetSet 是特定 Stage topology 上的确定性 fixture 集合，支持 All、Rows、Columns、Grid Zones、Checkerboard、Center/Edges、Fixture IDs 和静态 weights。它的精确引用包含 Stage ID、内部 revision 和 TargetSet ID。

compiler 为每个 TargetSet 预计算 fixture indices、bitset、partition indices、空间排序和 weights。播放期间不修改集合，也不逐帧重新解析 selector。

## Cue Layer 负责绑定

`CueDefinition` 固定一个兼容 Stage。每个 Layer 保存：

- 一个精确 Effect 引用；
- 一个属于该 Stage 的 TargetSet 引用；
- 可选 TargetingScene；
- parameter overrides、phase、seed、layer、priority、trigger policy；
- 对发生共享属性写入时的显式 MixPolicy。

Arrangement CueClip 只引用 Cue，不直接选择 TargetSet。不要在 Clip inspector 增加 TargetSet 选择器。

### Cue Layer identity

Cue Layer 的持久化 `id` 只承担精确引用身份，不承担 Cue 名、Effect、TargetSet、方位或顺序语义。新建 Layer 使用一次性生成的 `layer_<base32-random>` opaque ID，之后编辑 Cue 名、Effect、TargetSet、scene、参数或顺序都保留该 ID；复制 Layer 或整个 Cue 时为每个副本生成新 ID。

复制操作在同一 transaction 内同步重映射 Cue automation target。删除 Layer 同步删除以它为 target 的 Cue automation。任何普通更新入口都会忽略对 Layer ID 的改写，因此不会意外切断 Arrangement 的 `clip_id + layer_id + parameter_id` exact target。

Built-in Cue/recipe 的 opaque ID 生成一次后固定提交到声明式 Catalog。既有项目中的历史语义 ID 默认保留但完全隐藏，不做宽泛字符串迁移。普通列表、Inspector、Tooltip、aria-label、校验诊断、导出摘要和 automation display label 不展示 raw ID；诊断使用 `Layer 1/2/N`。正式 JSON 仍包含精确 ID，因为资产包与 compiler 需要解析引用。

删除未被引用的 My Cue 会直接形成一次可撤销 transaction。若 Cue 已被 Arrangement 使用，UI 必须先列出 CueClip 与 Arrangement 数量并二次确认；确认后在同一 transaction 中删除 exact Cue、所有引用它的 CueClip，以及以这些 `clip_id` 为 target 的 Arrangement typed automation lane。取消不修改文档，Undo 一次恢复全部依赖。

## 多分区路径

同时效果：在同一个 Cue 中建立多个 Layer，每个 Layer 绑定不同 TargetSet。

分时效果：为不同 TargetSet 建立多个 Cue，再在 Arrangement 中安排它们的位置、时长、重叠和自动化。

20×20 starter Stage 提供：

- 四个 2×2 quadrant TargetSet，每个正好 100 fixtures（10×10）。
- 从 4×4 grid 中选出的四个 corner TargetSet，每个正好 25 fixtures（5×5）。

当两个 Layer 或两个同时 active 的 CueClip 的 fixture membership 与属性写入相交时，validator 要求对应 attribute 的显式 MixPolicy。没有明确策略时 preview、Save 和 Go Live 都 fail closed。

Cue 的 `risk_summary.strobe_risk` 是作者可读摘要，不要求与所有 pinned Effect 中的最高值完全相等。Catalog 中每个 Effect 的 `strobe_risk` 以及运行时 Effect 风险检查仍是安全判断的权威来源；移除摘要相等限制不会放宽 Effect 本身的风险声明或 Live 过滤。

## TargetingScene

TargetingScene 是 Stage 内一组有序 selection steps，可表达 All → partitions → All、hard/weighted transition、loop 和 phase continuity。它不拥有 EffectGraph、CueClip 或 TempoMap。scene 在 compile 阶段转换为 step boundary 与 fixture weight cache。

## 关键实现

- Contract：`src-tauri/src/document/project.rs`
- Selector/overlap validation：`src-tauri/src/document/project_validation.rs`
- Compilation：`src-tauri/src/compiler/project.rs`
- Frontend topology：`src/document/stageTopology.ts`
- Stage editors：`src/workspace/stage/TargetSetEditor.tsx`、`TargetingSceneEditor.tsx`
- Cue builder：`src/workspace/cues/`

## 验收

- TargetSet 新建、复制、保存和删除保护都形成单次可撤销 transaction。
- 多 Layer Cue 同时点亮四个 10×10 quadrant。
- 四个 5×5 corner TargetSet 可独立选择并正确解析；内置空间运动示例使用四个 10×10 quadrant，避免为极小空间采样改变 Effect 定义。多个 Cue 顺序或重叠调度时，相交区域写同一属性仍要求明确 MixPolicy。
- Cue Layer 的 Effect/TargetSet/scene 引用在保存与重开后保持精确。
- 新建/复制 Layer 的 opaque ID 唯一；编辑保留 ID，复制/删除时 automation target 原子重映射或清理并可完整 Undo。
- 删除已被 Arrangement 引用的 My Cue 会明确确认依赖范围，Cue、CueClip 和 clip-local automation 原子删除并可一次 Undo；不会留下无效 exact ref。
