# Stage 6 紧凑 Workspace Shell 原生证据

## 实现与视觉方向

- 基线：`main@3a690c0`；实现分支：`codex/song-driven-dj-workspace`。
- 2026-08-02 在真实 macOS Tauri/WebKit 应用中验证。Retina PNG 为原生逻辑尺寸的
  2 倍像素。
- 采用紧凑 DJ timecode workspace：graphite 基底、紫色编辑动作、后续 Live 使用琥珀、
  Audio 使用青色、Blackout 使用红色。Canvas/Timeline 保持最大视觉权重。
- shadcn 组件通过 npm 官方 registry 调用 CLI：
  `npm exec --yes --registry=https://registry.npmjs.org shadcn@latest -- ...`。本切片复用
  Resizable、Badge、Separator、ScrollArea、Empty、Button 与 Tooltip。

## 原生窗口矩阵

| 场景             | 原生逻辑尺寸 | 证据                                                                                 | 结论                                                     |
| ---------------- | ------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Stage 最大化     | `1512 × 892` | [`workspace-stage-maximized.png`](./workspace-stage-maximized.png)                   | 五工作区、context library、Canvas 和 Inspector 同时可用  |
| Stage 最小窗口   | `1100 × 720` | [`workspace-stage-minimum-1100x720.png`](./workspace-stage-minimum-1100x720.png)     | Header、状态 badges、Canvas 和 Inspector 无重叠或裁切    |
| Arrange 最小窗口 | `1100 × 720` | [`workspace-arrange-minimum-1100x720.png`](./workspace-arrange-minimum-1100x720.png) | Canvas/Timeline 可垂直调整，既有 Sequencer 保持主工作区  |
| Advanced 最大化  | `1512 × 891` | [`workspace-advanced-maximized.png`](./workspace-advanced-maximized.png)             | Raw DSL 仅在显式 Advanced Mode 出现，普通路径不依赖 JSON |

当前显示器可用高度在不同启动时把普通最大化约束为 `891–892`；全部窗口均为
`AXFullScreen=false`。

## Accessibility 证据

原生 Accessibility 树确认下列一级工作区均为具名 `AXButton`：

- Stage
- Effect Lab
- Song
- Arrange
- Live / Rehearse

Header 的 Publish、Take live、Advanced、Hide context library 和 Hide inspector 均有可访问
名称；一级工作区 target 为 48px 高，键盘 focus ring 在原生截图中可见。全局
`prefers-reduced-motion` 会移除动画和长 transition。

## Revision 边界

- 冷启动 starter project 通过兼容 `load_dsl` 建立 `Published r1 / Live r1`，之后普通编辑路径
  不再热替换 Live。
- Header 的 Publish 只调用 `publish_dsl`；Take live 才调用 `activate_show_revision`。
- 前端集成测试证明 Publish 后状态为 `Published r2 / Live r1`，仅在显式 Take live 后变为
  `Live r2`。
- 后端并发测试证明连续发布到 r101 时 scheduler 仍读取 r1，除非显式 activate。

原生 Publish 点击复核第一次执行时窗口已被宿主关闭；随后 macOS 会话只暴露
`loginwindow`，重启进程没有可访问窗口。因此本切片保留 backend + frontend integration
证据，不把该宿主状态误记为产品失败，并在 Stage 6 完整用户路径验收时重跑原生点击。

## 保持不变的交互内核

Workspace Shell 只以 `embedded` 布局复用现有 Canvas、TimelinePanel 和 ControlPanel。
Timeline 的原生 PointerEvents、rAF/DOM ref 拖拽预览、统一 snap、duration 保持、单次
DocumentCommand 与 Undo/Redo 均未改写；高频交互没有新增 React DND 或逐帧 Zustand 写入。
