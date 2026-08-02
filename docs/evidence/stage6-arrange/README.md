# Stage 6 Arrange 证据

## 实现边界

- Arrange Library 直接读取当前 Draft 的 `EffectDefinition.revision` 与匹配的
  `EffectInstance.definition_revision`，不再等待或依赖旧的 compile result。
- 单击选择后点击 Timeline，以及 HTML 原生 drag/drop，最终都进入同一个 `placeEffect`，复用
  `pixelsToTicks`、`snapTick` 和 Stage 5 的 TimelineGeometry；既有 clip 移动/resize 继续使用
  PointerEvents、DOM ref 与 rAF preview，没有引入 React DND。
- 用户界面显示 EffectDefinition 名称和 project track 名称，`phaser:<instance-id>` 仅保留为内部
  track identity。时间轴块的 accessible name 同样使用效果名称。
- 空 Library 给出前往 Effect Lab 的恢复提示；失效 revision 给出可操作错误；工具栏提供可键盘
  聚焦的快捷键帮助。Song Spine 预留 waveform、section 和 marker 的固定区域供 Stage 7 复用。

## 视觉与交互检查

| 场景                 | 证据                                                                                             | 结果                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 1440×900 empty state | [`arrange-browser-1440x900.png`](./arrange-browser-1440x900.png)                                 | Canvas 与 Timeline 同时可用，空状态及 Song Spine 清晰             |
| 快捷键帮助           | [`arrange-shortcuts-browser-1440x900.png`](./arrange-shortcuts-browser-1440x900.png)             | icon button 有 accessible name、focus 与可读操作表                |
| Draft Effect 直通    | [`arrange-effect-library-browser-1440x900.png`](./arrange-effect-library-browser-1440x900.png)   | Effect Lab 创建的 Red Pulse r1 无需 Publish/DSL 即进入 Library    |
| 真实指针点击放置     | [`arrange-click-placement-browser-1440x900.png`](./arrange-click-placement-browser-1440x900.png) | 真实 pointer 在 beat 6 放置 4-beat clip，名称与成功状态可读       |
| 最小窗口             | [`arrange-browser-minimum-1100x720.png`](./arrange-browser-minimum-1100x720.png)                 | Canvas、Inspector、Library、Song Spine 和已放置 clip 无重叠或裁切 |

这些截图来自本地 Vite 页面，只用于布局和前端交互 QA。浏览器没有 Tauri IPC，因此不作为原生音频、
发布或灯光预览证据；完整真实 Tauri 用户路径将在 Live/Rehearse 集成后统一重跑。

## 自动化验证

- `TimelineResourcePanel`：Draft revision 可选择/拖动，payload 为稳定 instance ID，空状态可恢复。
- `DroppableTrack`：HTML native drop 进入新增 action；Stage 5 PointerEvents 测试保持通过。
- `useTimelineTracks` / `DraggableBlock`：用户名称不泄露内部 `phaser:id`，focus、nudge、delete
  keyboard contract 保持通过。
- `TimelineToolbar`：快捷键 help trigger 可聚焦并打开。
- 完整 `pnpm check:all` 通过：41 frontend files / 90 tests；76 Rust unit + 12
  contracts/golden/templates；schema、format、typecheck、Vite build 与 strict Clippy 全绿。
