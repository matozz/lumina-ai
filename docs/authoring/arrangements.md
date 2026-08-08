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

## Overlap 与 MixPolicy

Track overlap policy 处理 Clip 的时间占用；fixture 属性的冲突仍由 Cue Layer/Clip layer overrides 的显式 MixPolicy 处理。跨 CueClip 的相交 fixture 和相同 attribute 必须可证明有策略，否则 Arrangement validation fail closed。

Automation target 必须能经 Cue → Layer → Effect parameter 精确解析；同一 Arrangement 中一个 typed target 只允许一条权威 lane。continuous 参数允许曲线插值，discrete 参数强制 hold。

## Authoring transport

Lab、Cues 和 Arrange 共用 Authoring Transport 语义：Play、Pause、Stop、Seek、Loop。页面打开、选择 Arrangement 或切换 workspace 不会自动 Play。Stop 回到 loop start；未启用 loop 时回到 tick 0。

## 关键实现

- Contract：`src-tauri/src/document/project.rs`、`src-tauri/src/document/timeline.rs`
- Pure evaluation：`src-tauri/src/engine/timeline.rs`、`src-tauri/src/engine/render.rs`
- Frontend clock：`src/authoring/transport.ts`、`src/authoring/musicalTime.ts`
- Timeline：`src/workspace/arrange/`、`src/panel/`

## 验收

- 多 Cue placement、重叠、resize、automation、Undo/Redo 和 save/reopen 保持 tick 不变。
- 3/4、4/4、拍号切换、多 TempoMap 和任意 Seek/Replay 结果确定。
- 1,000 CueClip 的 viewport 和 DOM-ref 高频路径满足交互预算。
- 1100×720 下 library、canvas、timeline 和 inspector 均可操作且无横向抖动。
