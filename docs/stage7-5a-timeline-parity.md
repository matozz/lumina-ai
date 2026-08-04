# Stage 7.5A Timeline capability parity matrix

> 基线：`main@411656f`。本矩阵只服务 Stage 7.5A；不包含 LayoutPreset、动态 Targeting 或 Production Catalog。

| Capability          | Stage 5/6 已验证实现                            | Stage 7 临时实现                           | Stage 7.5A 迁移目标                                   | 所有权/性能约束                               |
| ------------------- | ----------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- | --------------------------------------------- |
| Zoom                | `TimelinePanel.handleZoom` + `TimelineGeometry` | 固定 48px/beat                             | viewport center anchored zoom                         | session UI state；不改 tick                   |
| Snap                | adaptive `gridSnapBeats`、snap guide            | geometry 有 snap，但无控制/guide           | zoom-aware snap + visible guide                       | pointer move 只写 DOM/ref                     |
| Viewport            | 8-beat overscan、visible event filter           | 全量挂载                                   | CueClip/lane/bar label virtualization                 | 1,000 clips gate                              |
| Playhead            | 独立 engine subscription + DOM ref              | parent 订阅 session 后 React render        | 独立 AuthoringClock subscription + DOM ref            | 60fps 不重渲染 Timeline tree                  |
| Ruler               | quarter-note grid                               | 每 4 beat 固定 bar                         | TempoMap/TimeSignatureMap-aware bar/beat ruler        | arbitrary 3/4、4/4、meter change              |
| Seek                | ruler pointer/keyboard → engine seek            | ruler pointer → session tick               | shared AuthoringTransport Seek                        | 只写 PreviewSession，永不 Live                |
| Clip place          | EffectInstance placement                        | selected Cue at playhead                   | Cue revision placement                                | Arrangement 只保存 `CueClip.cue_ref`          |
| Clip move           | PointerEvents + DOM transform + one command     | PointerEvents + DOM transform + one update | CueClip adapter + one transaction                     | pointermove 无 Zustand/bundle/Tauri write     |
| Clip resize         | DOM width preview + keyboard resize             | 缺失                                       | leading/trailing resize + keyboard                    | start/duration/source offset 整数 tick        |
| Delete/duplicate    | keyboard guarded commands                       | 仅 Delete                                  | Delete、Duplicate 与 focus guard                      | 一次 action 一次 Undo entry                   |
| Selection inspector | clip/keyframe/lane inspectors                   | 缺失                                       | CueClip fields、pinned Cue revision、timing inspector | selection session-only                        |
| Automation lane     | typed target menu + uniqueness gate             | 只画菱形 keyframe                          | Arrangement target adapter + typed lane               | 解析 Cue→layer→Effect exact revisions         |
| Automation curve    | continuous/discrete interpolation               | 缺失                                       | linear/hold/easing curve segments                     | continuous/discrete contract 不降级           |
| Keyframes           | 任意多个、pointer/box/keyboard、inspector       | 不可聚焦 span                              | pointer/keyboard selection、move/add/delete/edit      | pointermove DOM ref；pointerup 单 transaction |
| Undo/Redo           | `DocumentCommand` transaction/history           | Project history，move 一次 update          | Arrangement command transaction/history               | Published 首次编辑显式 fork                   |
| Diagnostics         | command exceptions 多进入 Header                | Header 截断状态                            | action-local structured Diagnostic + recovery         | fail closed；Header 仅摘要                    |

## Adapter boundary

可直接复用的无所有权模块：`timelineGeometry`、`virtualization`、keyframe/curve geometry、PointerEvents capture
方式、rAF DOM preview、keyboard text-edit guard、zoom anchoring和 snap guide 行为。

必须重写的 V4 adapter：`useTimelineEvents` 对 `FullDSL/DocumentCommand` 的依赖、`TimelineResourcePanel` 对
EffectInstance 的依赖、`TimelineTrackHeaders` 对 V4 parameter resolver 的依赖，以及 `DroppableTrack` 对
`TimelineEventDSL` 的依赖。新 adapter 必须直接消费 `ArrangementDocument`、`CueClip`、
`ArrangementAutomationLane` 和 exact Cue/Effect revision。

迁移完成后，`WorkspaceContent` 只挂载 `ArrangementTimeline`。旧 `TimelinePanel` 在 Stage 7.5A 保持无调用者，
到 7.5E 连同其他 V4-only shell 一起删除；本阶段不边迁移边删除已验证参考实现。
