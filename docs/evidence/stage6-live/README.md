# Stage 6 Live / Rehearse 证据

## 实现边界

- Live Library 与 Pad 通过新的 `get_live_effects` 只读取当前 immutable Live Snapshot；Publish
  但未 Take live 的 revision 不会提前出现在演出控制面。
- Beat/bar/off 量化在 Rust `RuntimeState` 中形成稳定 action queue，由现有唯一 scheduler worker
  在 transport beat 边界应用；前端没有用 `setTimeout` 近似歌曲时间。
- Pad 支持 toggle、momentary、one-shot 和命名 exclusive group。One-shot stop、exclusive 替换和
  momentary 在量化边界前释放取消均按 `(target beat, sequence)` 确定排序。
- Pause 只冻结 cursor，Stop 清理 pad 并回到歌曲开头；Blackout 是独立、始终可见的输出 latch，
  不停止 transport，也不清空 active effect，解除后请求 full frame resync。
- 诊断显示 output target FPS、实际 scheduler deadline lag、adapter、last error 与 Live show
  revision。Beat meter 直接订阅 Zustand 并只修改四个 DOM ref，不按帧重渲染整块 Inspector。

## 视觉检查

| 场景                 | 证据                                                                                   | 结果                                                                  |
| -------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1440×900 Live 空状态 | [`live-empty-browser-1440x900.png`](./live-empty-browser-1440x900.png)                 | Canvas 为主区；Transport、常显 Blackout、quantize、恢复提示与诊断清晰 |
| 1100×720 最小窗口    | [`live-empty-browser-minimum-1100x720.png`](./live-empty-browser-minimum-1100x720.png) | 三个 panel 无重叠；Inspector 保持全部安全控制和诊断                   |

这些浏览器截图只验证布局；普通浏览器没有 Tauri IPC。Live effect 样例、真实量化触发和 Blackout
输出以自动化测试及 Stage 6 最终真实 Tauri 路径为准。

## 自动化验证

- Rust：beat/bar boundary、one-shot stop、exclusive group、momentary pre-boundary cancel；
  latched Blackout 在 transport 继续播放时连续输出 `RecordedFrameKind::Blackout`，解除后恢复
  normal frame 且 cursor 不变。
- Frontend：Live Snapshot 不显示 Draft-only effect；Pad config 持久化；toggle/momentary/
  one-shot/exclusive payload；Play/Pause/Stop/Blackout 独立 accessible button；diagnostic runtime
  payload 保留未变化 active-pad array identity。
- 完整 `pnpm check:all` 通过：43 frontend files / 96 tests；80 Rust unit + 12
  contracts/golden/templates；schema、format、typecheck、Vite build 与 strict Clippy 全绿。
