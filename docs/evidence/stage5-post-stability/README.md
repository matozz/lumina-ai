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

宿主拒绝 `screencapture`，因此本轮基线使用用户原始截图、原生 AX 窗口/控件树和浏览器渲染证据组合留档。最终验收仍需在修复后的真实 Tauri 窗口重复执行并记录等价证据。

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

## 尚待本 Goal 完成的证据

- 默认最大化与最小窗口尺寸的配置/布局测试。
- 修复后真实 Tauri 窗口的关键帧、Effect Clip 同轨/跨轨、resize、播放中拖拽、Undo/Redo、最大化启动和最小窗口矩阵。
