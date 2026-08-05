# Stage 7.5B/7.5C Layout 与 Production Targeting acceptance

> 日期：2026-08-05
>
> 基线：`main@a725ee6`
>
> 分支：`codex/layout-presets-dynamic-targeting`
>
> 范围：Stage 7.5B、7.5C；不包含 7.5D Production Effect/Cue Catalog

## 结论

Stage 7.5B/7.5C 的 scoped 退出条件已满足。用户可以从 Layout Library 复制并隔离编辑布局，保存或另存为
独立 Layout revision，在 Canvas 即时预览，并通过 topology impact/remap transaction 安全应用到 Stage。
用户也可以可视化编辑 immutable TargetSet 与 TargetingScene，确定性执行 All → 3×3 Zones → All、hard
switch、weighted transition、phase continuity 和 beat/bar snap。

Stage 7 Project/Effect/Cue/Arrangement 边界、7.5A AuthoringTransport/ArrangementTimeline、Published Project
和 Live Snapshot 均未被重新设计或静默修改。

## 资产、迁移与 revision 边界

- `LayoutDefinition` 是独立版本化资产；Project manifest 保存精确 `layout_refs`，Stage 只保存精确
  `layout_ref`。
- Basic 覆盖 matrix、circle、strip/bar、wall、frame；Generated/Advanced 覆盖 formula、SVG path、custom、
  Lissajous/spiral algorithm，并声明 `form`、`parameter_schema`、`advanced_only`、`read_only` capability。
- matrix/wall/strip/frame 分离 fixture size、gap 和 pitch；gap=0 通过 schema、几何、Canvas 与真实 Tauri
  零间距 30×30 路径。
- Project bundle V1 的 Stage 内嵌布局经显式 migration 提取为默认 Layout asset；fixture IDs、坐标结果、
  Group、TargetSet 与既有引用保持。
- Save Draft、Save As、Duplicate、Rename、Delete 只修改 Layout Library。只有显式 Use on Stage 会 fork
  Stage；需要时再显式 fork Draft Cue/Arrangement。Published revisions、旧 revisions 与 Live Snapshot 不变。

## Stage impact 与 recovery

`Use on Stage` 在 transaction 前显示 fixture/capacity/moved-coordinate diff，以及 Group、TargetSet、直接 Cue
和间接 Arrangement 影响。兼容 topology 提供显式 upgrade；不兼容 topology 提供：

- TargetSet remap + listed dependent revision upgrade；
- 创建新 Stage + 空 Arrangement；
- 保留旧 Stage revision；
- Cancel 且不写 history/bundle。

真实 Tauri 先验证 30×30 零间距兼容升级，再用同容量 20×45 Layout 触发 4 个 TargetSet topology 影响；
Rows selector 显示 action-local `TARGET_SET_INVALID` 与 recovery，impact rail 列出 1 Cue 和 2 个间接
Arrangement，并成功完成 remap。重开后 Stage r5、20×45 Layout、3×3 Zones 与 Scene 仍可解析。

## Production Targeting 与热路径

- TargetSet editor 覆盖 All、Rows、Columns、R×C Zones、Checkerboard、Center/Edges、Fixture IDs/custom 与
  0–1 fixture weights，并支持命名、复制、Canvas preview、删除保护和引用计数。
- TargetingScene editor 支持 All → partitions → All 模板、单步预览、hard/weighted、beat/bar duration、loop
  和 phase continuity；生产模板优先 3×3 Grid Zones。
- Cue layer 只保存同一精确 Stage revision 的 TargetingScene ref；播放中从不修改 Fixture Group membership。
- compiler 预计算 TargetSet membership/partition/spatial cache、scene step end ticks、transition ticks 和按
  fixture index 对齐的 weight arrays。render 只做 bitset/index、step 二分和 weight 插值；无逐帧字符串解析、
  线性 fixture 查找或拓扑分配。

## 自动化验证

| Gate             | 结果                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm check:all` | 通过；schema、Prettier、TypeScript、Vite、strict Clippy、全部前端/Rust 测试                     |
| Frontend         | 60 files / 163 tests；migration、reference、Undo/Redo、revision isolation、编辑器和 persistence |
| Rust             | 112 unit + 12 integration/contracts = 124                                                       |
| 30×30            | All → 9 个 3×3 partitions → All；hard/weighted；随机 Seek/Replay frame 相等                     |
| ≥1,000 fixtures  | 4 个并行 TargetingScene layers、180 个随机 60Hz frames；确定性且平均低于 16.67ms                |
| 时间语义         | 完整 TimeSignatureMap；3/8→4/4 bar snap；beat/bar transition；phase continuity on/off           |
| Bundle           | `pnpm tauri build --debug --bundles app` 通过；默认 debug DMG 仍由既有 R-019 跟踪               |

## 真实 Tauri 验收

在当前 debug `.app` 完成：

1. Layout Library → Duplicate → 编辑名称/fixture size/gap/pitch → Save As；
2. session-local Canvas preview，确认 Stage ref 在 Use on Stage 前不变；
3. compatible impact → Stage/Cue/Arrangement 显式 upgrade；
4. 20×45 incompatible impact → TargetSet remap → 保存重开；
5. 3×3 Zones TargetSet full/partition preview；
6. TargetingScene All → 9 partitions → weighted All，逐 bar、phase continuity，并保存重开；
7. 清空 Layout name 触发 `LAYOUT_NAME_EMPTY · layout.name` inline Diagnostic，键盘恢复后操作重新可用；
8. 最大化与 1100×720 content minimum 路径无裁切；Tauri 配置 1440×900，当前宿主显示范围会把默认窗口
   clamp 为可用桌面尺寸，因此同时核对了配置 contract 与宿主最大化实际布局。

全程没有自动 Publish、Take Live 或修改 Fixture Group membership。旧 V4 Stage Setup shell 只在表单、
Canvas、Group、migration 与回归 parity 完成后删除。

## 补充布局与速度回归

2026-08-05 根据 10×10 Draft、Stage 子视图切换和 speed override 的真实使用反馈补充验证：

- Layout Draft preview 改为直接编译候选 Layout，不再因当前 Stage patch 数大于候选容量而停留在旧 Canvas；
  容量差异仅在 Use on Stage impact 中作为结构化 warning/blocker 处理。
- 矩形类 Setup 只暴露 rows、columns、fixture width/height 与 edge gap；circle 只暴露 rings、ring gap 与共用
  fixture width/height。派生 pitch、ring pitch 和 circle increment 不再要求用户重复输入。
- fixture size、gap、行列和圈数均规范化为整数；所有可编辑 Layout 支持全局 fixture size 与按 fixture ID
  的独立 width/height override，Canvas 按最终尺寸渲染矩形或椭圆，而不是固定尺寸方块。
- Layout asset control 固定在 Setup、Groups、TargetSets、Scenes 共用区域；Stage/TargetSet/Group transaction
  不会因 bundle 对象身份变化重置未保存 Draft。
- Cue speed override 只允许 Effect default、0.25×、0.5×、1×、2×、4×、8×；前端选择器与 Rust semantic
  validation 使用同一组节拍同步倍率。
- 真实 Tauri 验证 900-fixture Stage 上的 10×10 独立 Canvas preview、7.4→7 整数规范化、跨 Groups transaction
  Draft 保持和完整 speed 倍率菜单；`pnpm check:all`、debug app bundle 全部通过。

## Patch、全局 speed 与大布局回归

2026-08-05 根据 20×45 → 21×45、Effect default speed 和 900-fixture Group/TargetSet 的后续反馈补充：

- Layout Draft capacity 与 Stage Patch fixture count 分离。20×45 Stage 上编辑 21×45 会立即预览 945 个位置，
  其中现有 900 个为 patched，新增 45 个以 dashed hairline 显示；不会静默创建 fixture 或输出。
- `Configure Stage patch` 并列显示 Draft positions、active Layout positions、patched fixtures 和 Stage revision。
  Draft 尚未 Use on Stage 时给出“Save Layout → impact/remap → Use on Stage → reopen Patch”的就地 recovery；
  保存 Patch 会 fork Stage 与列出的 Draft Cue/Arrangement revisions，Published/Live 保持隔离。
- Canvas fixture outline 从 1px 降为 0.5px screen-space hairline；unpatched preview position 使用更暗的虚线。
- Effect create/edit speed、Effect default speed、Cue speed override、typed speed automation keyframe、Live Pad 和
  legacy phaser command 全部收敛到 0.25×、0.5×、1×、2×、4×、8×；Project semantic validation 同时覆盖
  Effect default、Cue/Arrangement override 与 automation keyframe。
- Groups 和 TargetSets 在 20×45 / 900 fixtures 下使用独立、可滚动的大 Dialog；membership grid、Save、
  Duplicate、Preview、Delete protection 和引用影响不再在窄 inspector 中堆叠。
- `pnpm check:all` 通过（163 frontend tests；112 Rust unit + 12 integration/contracts）；
  `pnpm tauri build --debug --bundles app` 通过。真实 Tauri 已验证 21×45/945 Draft + 45 unpatched、Effect
  default speed 完整倍率菜单，以及 20×45 Group/TargetSet expanded Dialog。

## Scope stop

Stage 7.5B/7.5C 无剩余 blocker。本 Goal 到此停止；Stage 7.5 总状态保持 `in_progress`，因为 7.5D
Production Effect/Cue Catalog 与 7.5E 全 Stage 收口仍未实现。不得由本交接推导开始 AI、音频、硬件输出或
Production Catalog。
