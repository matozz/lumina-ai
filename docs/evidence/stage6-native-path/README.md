# Stage 6 无 DSL 原生用户路径

## 验收环境

- 真实 debug Tauri `.app`，macOS 最大化逻辑窗口 `1512 × 892`。
- Computer Use 读取 WebView AX 树并执行可访问 element action、原生 PointerEvent 坐标点击与键盘操作。
- 顶部 `Advanced` toggle 在整条路径中始终为 `off`；没有打开 Raw DSL Editor。

## 路径证据

| 步骤                    | AX/行为证据                                                                                          | 截图                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 4×4 RGB Stage           | Stage Setup 显示 `generic-rgb`、Quantity `16`、Matrix `4` columns、channels `1–64`                   | 复用 [`../stage6-stage-setup/stage-setup-maximized.png`](../stage6-stage-setup/stage-setup-maximized.png) |
| Red Pulse → Arrange     | Effect Lab 创建 `Red Pulse r1`；Arrange Library 同一 revision 可选                                   | [`arrange-32-beats-native.png`](./arrange-32-beats-native.png)                                            |
| 八小节效果块            | clip AX 明确为 `starts at beat 2, duration 32 beats`；通过 `Alt+Right` 键盘替代路径调整              | [`arrange-32-beats-native.png`](./arrange-32-beats-native.png)                                            |
| Intensity automation    | typed menu 选择 `Intensity scalar · normalized` 后 Inspector `Tracks` 从 `1` 变为 `2`                | [`arrange-automation-native.png`](./arrange-automation-native.png)                                        |
| Draft/Published/Live    | Publish 得到 `Published r2 / Live r1`；显式 Take live 后 `Live r2`                                   | [`live-pad-quantized-native.png`](./live-pad-quantized-native.png)                                        |
| Play/Pause/Rehearse Pad | Play 后 Pause/Stop 启用；Beat quantize Pad 显示 on，状态为 `Red Pulse armed for beat 36`             | [`live-pad-quantized-native.png`](./live-pad-quantized-native.png)                                        |
| Pause                   | Pause 后按钮变为 `Resume rehearsal`，Stop 保持启用且 Live Pad 状态不被清空                           | [`rehearsal-paused-native.png`](./rehearsal-paused-native.png)                                            |
| Seek                    | 修复后的 ruler 是 AX slider；pointer seek 到 beat 7，再按 Right 到 beat 8；显示 `3.1.000 / 0:04.000` | [`arrange-seek-native.png`](./arrange-seek-native.png)                                                    |
| Stop                    | Stop 后 Play 恢复、Pause/Stop disabled；Arrange 回到 `1.1.000 / 0:00.000`                            | [`arrange-stop-origin-native.png`](./arrange-stop-origin-native.png)                                      |

## 验收中发现并关闭的问题

首次完整路径发现 Arrange ruler 只有视觉刻度，没有调用 backend `seek` 的交互。Stage 6 保持
`in_progress`，补充了语义化 slider：pointer down 通过统一 snap 计算 beat，Arrow keys 逐 snap seek，
Shift+Arrow 逐四拍，Home/End 提供边界操作。调用现有 Tauri `seek`，先更新轻量 playhead store，失败时
回滚并在 Workspace Header 显示错误；没有改变 clip drag/resize 的 PointerEvents、DOM ref preview、
duration 或 Undo/Redo 路径。

修复后 `pnpm check:all` 全绿：45 frontend files / 102 tests、80 Rust unit + 12
contracts/golden/templates、schema、format、typecheck、Vite build 与 strict Clippy。原生 `.app` 随后
再次构建，pointer/keyboard Seek 与 Stop→origin 均由 AX 数值和截图确认。
