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

## 多分区路径

同时效果：在同一个 Cue 中建立多个 Layer，每个 Layer 绑定不同 TargetSet。

分时效果：为不同 TargetSet 建立多个 Cue，再在 Arrangement 中安排它们的位置、时长、重叠和自动化。

20×20 starter Stage 提供：

- 四个 2×2 quadrant TargetSet，每个正好 100 fixtures（10×10）。
- 从 4×4 grid 中选出的四个 corner TargetSet，每个正好 25 fixtures（5×5）。

当两个 Layer 或两个同时 active 的 CueClip 的 fixture membership 与属性写入相交时，validator 要求对应 attribute 的显式 MixPolicy。没有明确策略时 preview、Save 和 Go Live 都 fail closed。

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
