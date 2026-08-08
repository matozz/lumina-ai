# Arrangements

## 所有权

`ArrangementDocument` 独占 PPQ、TempoMap、TimeSignatureMap、长度、Cue tracks、CueClip、typed automation lanes 和 markers。CueClip 固定引用 Cue，并保存 start、duration、source offset、playback 和 layer overrides。

TargetSet 选择仍属于 Cue Layer。Arrangement 只负责调度 Cue；Clip schema 明确拒绝直接 `target_set_id` 字段。

## 时间

- 权威音乐时间是整数 tick，当前默认 PPQ 为 960。
- starter Arrangement 和所有本地预览默认 128 BPM。
- TempoMap/拍号可以包含多个 point；BPM、bar.beat.tick 和 seconds 都由 cursor 所在 segment 派生。
- 修改 TempoMap 不移动任何 CueClip 或 keyframe tick。

## Timeline 交互

- place、move、resize、duplicate、delete、nudge、source offset 和 automation 都通过 Arrangement transaction。
- Pointer move 只更新 DOM transform/width 和 snap guide；pointer up 最多提交一次 Project command 和一个 Undo entry。
- playhead 用独立 clock subscription 与 DOM ref 更新，不能让整个 Timeline 以 60Hz 重渲染。
- viewport 只挂载可见内容和 overscan，beat grid 使用常数节点/CSS pattern。

### Track、Layer 与视觉行

- 一个 Arrangement 可以包含多个 CueTrack；每个 CueTrack 保存 CueClip、`overlap_policy`，以及附属于该 Track 的 typed automation lanes。当前 Authoring Starter 的内置 Arrangement 都只使用一个 CueTrack，但这不是 Schema 限制。
- `CueClip.layer` 是保存到文档中的语义 Layer，用于调度顺序和混合优先级；它不等同于固定的屏幕行。
- Timeline 先按语义 Layer 分组。同一 Layer 内不重叠的 CueClip 复用同一视觉行；时间重叠的 CueClip 自动稳定装箱到额外视觉行。不同语义 Layer 始终分行展示。
- 视觉行只防止编辑器中的 CueClip 互相遮挡，不改写 `CueClip.layer`、Track、MixPolicy 或编译结果。Track 标题会同时显示 CueClip 数、语义 Layer 数和实际视觉行数。

## Overlap 与 MixPolicy

Track overlap policy 处理 Clip 的时间占用；fixture 属性的冲突仍由 Cue Layer/Clip layer overrides 的显式 MixPolicy 处理。跨 CueClip 的相交 fixture 和相同 attribute 必须可证明有策略，否则 Arrangement validation fail closed。

Automation target 必须能经 Cue → Layer → Effect parameter 精确解析；同一 Arrangement 中一个 typed target 只允许一条权威 lane。continuous 参数允许曲线插值，discrete 参数强制 hold。

## Authoring transport

Lab、Cues 和 Arrange 共用 Authoring Transport 语义：Play、Pause、Stop、Seek、Loop。页面打开和资产选择不会自动 Play；Lab/Cues 中若当前 session 正在播放，选择另一个 Effect/Cue 会把 cursor、loop 与 playing 状态连续迁移到新 session。切换功能区则执行 Stop 并回到 loop start；未启用 loop 时回到 tick 0。

## 内置多分区示例

Authoring Starter 物化两份可直接打开、播放和复制的 128 BPM 示例；它们引用 Project Template 中的 starter Cue，不把 TargetSet 复制进 CueClip：

- **Quadrant Motion · 128**：一个四 Layer Cue 同时驱动 20×20 Matrix 的四个 10×10 象限。前半段对左上 Ping-Pong 的 speed 做 1×→2× automation；后半段用 Clip layer override 将右上 Column Rain 切到 2×。
- **Four Corner Chase · 128**：四个单 Layer Cue 分时驱动 2×2 网格中的左上、右上、左下、右下四个 10×10 区域。Clip 交错重叠，但区域互不相交；最后一次回到左上并使用 2× speed。示例使用足够密集的空间采样，不为极小 TargetSet 改写 Effect 的作者宽度。

示例既覆盖“同时效果使用一个多 Layer Cue”，也覆盖“分时效果使用多个 Cue”。若把区域改成相交 TargetSet，并让层或 Clip 写相同属性，仍必须显式提供 MixPolicy，Catalog/Project validation 会 fail closed。

## 关键实现

- Contract：`src-tauri/src/document/project.rs`、`src-tauri/src/document/timeline.rs`
- Pure evaluation：`src-tauri/src/engine/timeline.rs`、`src-tauri/src/engine/render.rs`
- Frontend clock：`src/authoring/transport.ts`、`src/authoring/musicalTime.ts`
- Timeline：`src/workspace/arrange/`、`src/panel/`

## 验收

- 多 Cue placement、重叠、resize、automation、Undo/Redo 和 save/reopen 保持 tick 不变。
- 两份多分区示例的所有 Cue/Effect/Stage exact ref 均可解析；四象限各 100 fixtures，四角各 25 fixtures。
- 3/4、4/4、拍号切换、多 TempoMap 和任意 Seek/Replay 结果确定。
- 1,000 CueClip 的 viewport 和 DOM-ref 高频路径满足交互预算。
- 1100×720 下 library、canvas、timeline 和 inspector 均可操作且无横向抖动。
