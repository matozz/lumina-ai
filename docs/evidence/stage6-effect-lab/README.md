# Stage 6 Effect Lab 证据

## 实现边界

- Effect catalog 支持创建默认 Red Pulse、复制、重命名、删除、收藏与稳定 ID。
- 每次保存产生递增的 `EffectDefinition.revision`，并原子更新关联
  `EffectInstance.definition_revision`；Draft 不会替换 Published 或 Live Snapshot。
- 参数表单覆盖 target group、intensity/color attributes、sine/triangle/saw/pulse waveform、
  speed、phase、width、transition 与 color。
- 后端 `preview_effect_loop` 在 blocking worker 中只编译一次 Draft，并用真实 deterministic
  renderer 生成一小节多帧；前端通过 rAF + Canvas event 播放，不在每帧写 Zustand。
- Preview 支持 Play/Pause、可键盘操作的 scrub，以及保存下一 revision 后缓存 A/B 帧组对比。
- 已被 Arrange clip 或 automation 引用的 effect 不可删除，UI 会禁用删除并给出恢复提示。

## 视觉与交互检查

[`effect-lab-browser-r2-1440x900.png`](./effect-lab-browser-r2-1440x900.png) 是本地 Vite
页面在 `1440 × 900` viewport 的设计 QA：展示紧凑 catalog、Red Pulse Main r2、完整参数表单、
focusable controls 与 Draft/Published/Live 边界。浏览器不具备 Tauri IPC，因此该截图只用于布局
检查，不作为原生预览成功证据。

本切片曾两次从干净进程启动真实 `pnpm tauri dev`。Rust 进程、WebKit 子进程和 WindowServer
窗口均存在，但当前 macOS 会话的 AX 树返回 0 windows，跨 Space 截图只得到窗口框/黑色 WebView。
无效截图已移到临时目录，未作为证据提交；完整原生路径将在 Arrange/Live 集成后重跑。

## 自动化验证

- Frontend：39 files / 84 tests。覆盖 effect factory、V4 round-trip、CRUD、收藏、revision save、
  删除保护、loop frame dispatch、scrub 与 A/B comparison。
- Rust：`effect_loop_preview_renders_without_publishing` 生成 16 帧，验证单 fixture 帧数量与强度
  随 phase 变化；命令不访问 ShowStore。
- 完整 `pnpm check:all` 通过：84 frontend tests、76 Rust unit + 12
  contracts/golden/templates、schema、format、typecheck、Vite build 与 strict Clippy 全绿。
