# Stage 5 后置稳定性修复证据

## 分支与基线

- Stage 5 最终实现分支：`codex/effect-timeline-engine`。
- Stage 5 最终收口提交：`6ffce7a9591cc6380a301c09bbe1332fbb591df6`（`docs(plan): close Stage 4 and Stage 5 goal`）。
- `main` 尚不包含该提交；`fix/timeline-drag-window-experience` 因此直接基于 `6ffce7a` 创建，属于 stacked work，后续 PR 必须以 Stage 5 分支为依赖或在其合并后 rebase/retarget。
- 用户提供的原始问题截图保存在 [`baseline-reference.png`](./baseline-reference.png)。其中 Effect Clip 的可见宽度已在拖动开始后缩短至约两个网格，可作为宽度漂移基线。

## 原生窗口基线

2026-08-02 使用 `pnpm tauri dev` 启动真实应用，通过 macOS AX 树读取到：

- 初始主窗口：`800 × 600`，位置 `(356, 106)`，`AXFullScreen=false`；这证明 Stage 5 基线没有默认最大化。
- 执行标准窗口 Zoom 后：`1512 × 892`，位置 `(0, 33)`，`AXFullScreen=false`；这是非独占式最大化，不是沉浸全屏。
- 最大化后的 Timeline 可访问性 group：位置 `(352, 582)`，尺寸 `1440 × 343`，Library、Timeline header/grid 和主编辑区均存在。

首次基线 `screencapture` 被宿主拒绝，因此保留了用户原始截图和原生 AX 窗口/控件树。修复后的授权截图已成功保存，可与这些基线直接对照。

## 完整交互链路与根因

链路审计覆盖 `PointerEvent → DOM preview → zoom/grid 坐标换算 → snap → pointerup DocumentCommand → history → Zustand/React → DSL/ShowDocument compile`：

1. Stage 5 已正确避免在 clip `pointermove` 中写入全局 ShowDocument；全局写入发生在 `pointerup` 的单次 `applyDocumentTransaction`，随后进入一条 history、Zustand 文档同步和 DSL compile。
2. clip 与 automation 的每个原始 `pointermove` 都同步写 DOM，clip 还逐事件调用 `elementsFromPoint`，缺少 `requestAnimationFrame` 合并；高频输入会造成不均匀预览。
3. clip move、clip resize、automation keyframe 和 grid click 使用不同的硬编码换算/舍入规则，preview 与 commit 没有共享可测试 snap 函数；scroll rect 已包含偏移的路径还会再次叠加 `scrollLeft`。
4. clip move/cancel 结束时把 React 所有的 inline `width` 清成空字符串。因为文档 duration 未变，React diff 不会补写相同 width，元素随内容收缩，表现为拖动一开始宽度约变成两个 grid。command 本身没有修改 duration。
5. `duration || 4` 会把合法的零值当作缺失值；跨轨 hit-test/overlap 也不应在 pointerdown 改写源数据。

## 修复策略与回归证据

- clip 与 automation preview 由 `requestAnimationFrame` 合并，逐帧只改 DOM `transform/width`；拖动期间不提交全局 ShowDocument。
- zoom 决定的 `TimelineGeometry` 是唯一的 tick/pixel/scroll/snap 实现，preview 与 pointerup commit 共享同一结果；Timeline 同时显示 snap guide 和当前 tick。
- pointerdown 保存 ShowDocument 中的原始 track/item/start/duration/instance 和精确像素宽度；move/cross-track 不修改 duration，resize 才修改 duration，cancel/pointercancel/Escape 完整恢复预览。
- pointerup 只在存在真实差异时提交一次 document transaction；Undo/Redo 继续复用 Stage 5 history 架构。

聚焦验证：

- 首轮：20 项中 19 项通过；唯一失败来自旧测试夹具把播放头所在 tick 当作可用 quarter，属于期望值错误，不是实现回归。
- 修正夹具并补充同轨/跨轨独立断言后：聚焦集 10 个测试文件、18 项全部通过；完整 `src/panel` 17 个测试文件、32 项全部通过，覆盖不同 zoom/scroll snap、rAF 合并、preview/commit 一致、单 history、同轨/跨轨 duration 与宽度保持、resize、Escape cancel 和 Undo/Redo。
- `pnpm build` 通过；仅保留既有 Vite chunk-size 警告。

## 修复后窗口矩阵

- Tauri 配置固定 `1440 × 900` fallback、`1100 × 720` minimum、`maximized=true`、`fullscreen=false`；`RunEvent::Ready` 在窗口事件循环可用后执行标准 maximize，避免 setup 阶段只设置逻辑状态而没有实际 Zoom。
- 冷启动实测：窗口位置 `(0, 33)`、尺寸 `1512 × 892`、`AXFullScreen=false`。
- 常用尺寸：macOS 可用屏幕把 `1440 × 900` clamp 为 `1440 × 892`；Canvas `752 × 516`，Editor/Control/Timeline/Library 均在窗口边界内。
- 最小尺寸：`1100 × 720`；Canvas `562 × 400`，Editor `330px`、Control `208px`，Timeline toolbar 最右控件止于 `x=1282`、窗口右边界 `x=1306`。尝试设置 `900 × 600` 被原生约束恢复为 `1100 × 720`。
- [`layout-minimum-1100x720.png`](./layout-minimum-1100x720.png) 保留了最小窗口真实截图；Canvas、Timeline、Library 和右侧 Control/Inspector 没有相互覆盖或把主编辑区压缩到不可用。

## 真实 Tauri 交互矩阵

在最大化的真实 Tauri/WebKit 窗口中加载 `combined` V4 document，以原生 CG PointerEvent 和 macOS AX 树验证：

- Effect Clip 同轨移动：`bl_spread` 从 beat 12 snap 到 beat 13，duration 始终为 20 beats、可见宽度始终为 `800px`；只启用一条 Undo，Undo 回到 beat 12，Redo 回到 beat 13。
- Effect Clip 跨虚拟轨移动：20 beats / `800px` 保持不变，source track/clip identity 未被 overlap preview 改写；Undo 恢复原虚拟轨。
- Effect Clip resize：duration 从 20 精确变成 21 beats、宽度从 `800px` 变成 `840px`，证明只有 resize 修改 duration。
- keyframe preview：middle Speed keyframe 从 tick 15360 拖到 16320；[`keyframe-drag-preview-maximized.png`](./keyframe-drag-preview-maximized.png) 同时显示节点跟随位置、黄色 snap guide 和 `tick 16320`，pointerup 后 AX 名称也是 `Speed keyframe at tick 16320`。
- keyframe cancel：拖向 tick 17280 时发送真实 Escape，pointerup 后仍为 tick 16320。
- 播放中拖拽：先确认 transport 按钮为 `PAUSE`，随后把 keyframe 从 tick 16320 拖到 17280 并成功提交；播放到 document 末尾后回到 `PLAY`。
- popover 编辑键：React portal 中的 input keyboard event 原先会继续冒泡到 automation row/document shortcut。现在所有时间轴快捷键先排除 `input/textarea/select/contenteditable`；真实 Time tick 输入框中输入再 Backspace 后，3 个 Speed keyframe 和 Effect Clips 全部仍在。[`popover-delete-preserves-timeline.png`](./popover-delete-preserves-timeline.png) 保留了打开的编辑器与完整时间轴。

## 尚待本 Goal 完成的证据

- 完整统一门禁、最终增量提交和文档收口。
