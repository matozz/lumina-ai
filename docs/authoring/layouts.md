# Layouts

## 正式 Generator

V1 正式支持 Matrix、Wall、Strip、Frame、Circle、Sector、Polygon、Honeycomb、Formula 和 Algorithm。Custom/Freeform 仅保留已保存坐标的 contract 与不可用入口；SVG Path 仅保留只读 contract，本版本不提供自由拖拽或路径采样编辑器。

`catalog/builtin/generators/registry-v1.json` 是共享能力描述，声明每种 Generator 的：

- 参数 schema 和 quantity/spacing/shape/source 角色；
- 容量模型、坐标模型和校验模型；
- 编辑状态、稳定默认值和完整几何 auto-fit 预览策略。

坐标实现位于 `src/document/layoutDefinition.ts` 与 `src-tauri/src/document/project_layout.rs`。`catalog/builtin/generators/golden-v1.json` 锁定每个内置 Layout 的容量和坐标样本，防止两端语义漂移。

Algorithm 路径按物理距离重采样：开放式 Spiral 直接求相邻灯中心的等弦长位置，避免中心拥挤；闭合 Lissajous 按等弧长分布并省略重复终点。Formula 保持对保存表达式与 `t_range` 的确定性求值。Formula/Algorithm 预设始终出现在普通 Stage Library 的 **Generated** 分组；Advanced 只增加复制、底层资产检查等操作，不是预览入口。Layout-only Canvas 使用统一的可见 Draft tint，因此未播放 Effect 时仍能辨认完整几何。

## 数量与空间参数

数量参数只决定点数：

- Matrix/Wall/Honeycomb：`rows × columns`
- Strip/Formula/Algorithm：`count`
- Frame：`2 × (rows + columns) − 4`
- Circle：`1 + increment × rings × (rings + 1) / 2`
- Sector：`segments × rings × (rings + 1) / 2`
- Polygon：`sides × fixtures_per_side`

空间参数只决定几何密度：grid 使用 fixture size、gap 和 pitch；Circle/Sector 使用 fixture diameter、ring gap 和 ring pitch；Polygon 使用 radius。改变 rings、rows、columns、segments 等字段不得重写已保存 gap、pitch 或 radius。

## Stage 应用

Layout 预览总是生成完整容量，不受当前 Stage fixture 数量限制。**Use on Stage** 执行显式 transaction：

1. 计算候选 Layout 容量和位置。
2. 为容量生成稳定 fixture IDs 与 Patch。
3. 更新 Stage 的精确 Layout 引用。
4. 对仍可安全保留的 TargetSet 重新解析；starter 的常用分区会按新拓扑重建。
5. 校验引用它的 Cue/Arrangement，失败时不写 bundle/history。

保存或复制内置 Layout 会生成独立的项目 ID；不会覆盖 `catalog/builtin/layouts/` 中的源文件。

## 内置预设原则

内置目录覆盖中大型 Matrix/Wall、横竖 Strip、多比例 Frame、不同 rings/gap 的 Circle、多个角度/密度 Sector、三至六边形 Polygon、紧凑/宽松 Honeycomb，以及稳定 Formula/Algorithm 示例。Authoring Starter 引用完整内置 Layout 集，因此每个预设都可直接预览或复制成项目资产。每个 JSON 应表达不同的舞台用途，而不是仅用微小参数差异堆数量。

## 新增或修改 Generator

1. 先更新共享 Registry 和 Rust `LayoutGeometry` contract。
2. 同步 TypeScript/Rust 容量、坐标和语义校验。
3. 在 `LayoutGeometryEditor` 仅暴露 Registry 声明允许的编辑能力。
4. 补少量与大量元素、数量/间距独立性、Stage materialization 和前后端 parity 测试。
5. 更新 Catalog Golden，并视觉检查对称性、最近中心距离、auto-fit 和 fixture 数量。

## 验收

- Stage、Lab、Cues 和 Arrange 对同一个 Layout 得到相同 fixture 数量和坐标。
- Circle/Sector/Polygon/Honeycomb 在小量和大量配置下无明显重叠、畸变、过密或过散。
- 20×20 Matrix 应生成 400 个 fixtures，2×2 分区为四个 10×10，4×4 分区中的单区为 5×5。
- Custom 与 SVG 入口不会静默改写已保存数据。

## Canvas 灯块与眩光

单灯块的几何半径来自 Layout `fixture_size`：圆形灯取 `max(width, height) / 2`，矩形 Pixel 使用保存的宽高。Canvas 眩光参数统一位于 `src/canvas/visualConfig.ts`；`glow.radiusMultiplier` 控制眩光圆相对于灯块半径的倍数，默认 `2.5`，同时集中管理透明度、亮度阈值和大数量关闭阈值。该设置只影响 Canvas 可视化，不改变 Layout 坐标、Patch 或真实灯光输出。
