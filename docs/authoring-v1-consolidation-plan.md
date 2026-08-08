# Lumina Authoring V1 收敛规划

## 目的

本规划用于后续 Goal 的范围确认和实施指引，目标是收敛 Lumina 的 Layout、TargetSet、Effect、Cue、Arrangement、Schema 与配置入口。

本文只定义产品方向、系统边界、执行阶段和验收原则，不包含详细实现方案。

## 已确认的产品决策

1. Layout 增加扇形、多边形、蜂窝等常用规则布局，并继续支持参数计算布局。
2. 自由布局与 SVG 保留模型入口，本阶段不实现完整编辑或执行能力。
3. 分区效果继续通过 `Stage TargetSet → Cue Layer → Arrangement CueClip` 编排，不在 Arrange 中增加直接选择 TargetSet 的新概念。
4. 当前仍处于内部开发期，不承担历史项目兼容；所有活跃 Schema 以当前模型为基准重新统一为 V1。
5. 内置配置与用户配置分开存放；内置配置可直接人工调整，用户配置可复制、导出和迁移。
6. 建立统一 Authoring 文档入口，迁移有效内容后删除 `agent-docs/`。

## 1. Layout Generator 扩展与收敛

### 1.1 目标能力

第一批正式支持的 Layout 类型：

- 基础布局：Matrix、Wall、Strip、Frame、Circle。
- 新增规则布局：Sector、Polygon、Honeycomb。
- 参数计算布局：Formula，以及适合复用的 Algorithm 类型。
- 预留入口：Custom/Freeform、SVG Path。

Sector、Polygon、Honeycomb 应作为正式的一等 Layout 类型提供明确参数，而不是通过 Custom 坐标伪装。参数计算布局适合连续曲线或可重复算法；一次性、不规则点位继续由 Custom 表达。

### 1.2 参数原则

- 数量参数只决定生成多少点。
- Gap、Pitch、Radius 等空间参数只决定密度和间距。
- 改变 rings、rows、columns、segments 等数量时，不应隐式修改用户设置的 gap。
- Layout 在 Stage 中负责预览完整几何，不受已有 fixtures 数量限制。
- Layout 应用到 Stage 后，再按照 Layout 容量生成或更新 fixtures、Patch 与相关 TargetSet 关系。
- 默认参数必须产生可读、不重叠、不过密也不过散的布局。

### 1.3 自由布局与 SVG 边界

本阶段保留 Custom/Freeform 与 SVG Path 的 Schema 和 UI 入口，但允许标记为未开放或只读：

- 不实现自由拖拽编辑器。
- 不实现完整 SVG 路径采样和填充算法。
- 不把未实现入口加入默认新手流程。
- 已保存的数据不得因为入口未开放而被静默破坏。

### 1.4 Generator 逻辑收敛

规则布局能力完整后，对当前分散在前端与 Rust 中的容量计算、坐标生成、校验、参数表单和预览逻辑进行统一收敛。

收敛后的每个 Generator 应拥有一致的能力描述：

- 类型和参数 Schema。
- 容量计算。
- 坐标生成。
- 参数校验和诊断。
- 编辑能力声明。
- 默认参数与预览元数据。

前端和后端应共享同一份契约及一致的计算语义，避免同一 Layout 在 Stage 预览、Lab、Cue 和 Arrange 中得到不同 fixture 数量或坐标。

### 1.5 内置 Layout

Generator 收敛完成后再补充内置布局，避免预设绑定到临时参数或重复实现。

内置布局至少覆盖：

- 中大型 Matrix/Wall 点阵。
- 横向和纵向 Strip。
- 多种 Frame 比例。
- 不同 rings 和 gap 的 Circle。
- 不同角度、半径和密度的 Sector。
- 三角形、四边形、五边形、六边形 Polygon。
- 紧凑和宽松两种 Honeycomb。
- 少量视觉稳定的 Formula/Algorithm 示例。

内置预设以展示常见舞台构型为目标，不追求数量堆叠；每个预设都应有明显用途和稳定默认值。

## 2. 多分区在 Arrange 中的使用路径

当前模型已经支持对同一 Layout 的不同分区进行编排，不需要新增 Arrange 数据结构。

### 操作路径

1. 在 Stage 的 TargetSet 编辑器中建立区域，例如 Zone A、Zone B、Zone C、Zone D。
2. 在 Cue 中为不同 Effect Layer 选择对应 TargetSet。
3. 如果多个区域需要同时播放，在同一个 Cue 中使用多个 Layer。
4. 如果多个区域需要按时间分别出现，为不同区域创建独立 Cue。
5. 在 Arrange 中把这些 Cue 放到时间线，通过位置、时长、重叠和自动化完成编排。

设计边界：TargetSet 绑定属于 Cue Layer；Arrange 负责调度 Cue。Arrange Clip 可以覆盖参数、相位和混合策略，但本规划不增加“在 Clip 中重新选择 TargetSet”的入口。

对 20×20 Matrix：

- 2×2 Zone 会得到四个 10×10 区域。
- 4×4 Zone 会得到十六个 5×5 区域，可以选择其中四个建立独立 TargetSet。

本阶段仅要求复核这条操作路径从 Stage、Cue 到 Arrange 可完整走通。

## 3. Schema V1 重新定基线

### 3.1 决策

当前 App 仍处于内部开发阶段，不保留历史 Schema 兼容逻辑。以当前最新领域模型为内容基础，重新定义统一的 V1；这里的 V1 是新的产品基线，不代表恢复旧 V1 数据结构。

Schema 版本字段继续保留，为未来正式发布后的不兼容升级做准备。

### 3.2 收敛范围

- ProjectBundle 与 ProjectManifest。
- Stage、Layout、Effect、Cue、Arrangement。
- 运行时仍在使用的 Show/DSL 文档契约。
- Production Catalog 与 Cue Recipe。
- 前端生成类型、Rust 类型、JSON Schema 和测试 fixture。
- 本地工作区持久化版本与默认 Reset 数据。

### 3.3 处理原则

- 所有活跃契约统一命名和标记为 V1。
- 加载与保存只接受新的 V1。
- 删除旧 V1/V2/V3/V4 之间的迁移、恢复和兼容分支。
- 删除不再使用的旧生成类型、Schema 与测试 fixture。
- Schema 重置时同步重置本地开发配置，避免旧 localStorage 数据进入新模型。
- UI 不展示 Schema 版本。
- 资产 revision 作为内部精确引用机制保留，但继续从普通用户界面隐藏。

正式对外发布后，Schema 再发生不兼容升级时必须恢复迁移策略；本次“只保留最新”仅适用于当前内部开发阶段。

## 4. 内置配置与用户配置

### 4.1 存放边界

内置配置采用可审查、可直接编辑的声明式文件，并纳入源码管理：

```text
catalog/
  builtin/
    layouts/
    effects/
    cues/
    arrangements/
    project-templates/
```

目录可以在构建时合并为运行时 Catalog，但源码中应保持按资产类型和用途拆分，避免继续把默认 Layout 写在 TypeScript、Effect/Cue 写在另一份大文件中。

用户配置保存在 ProjectBundle 中，并允许导出为独立的用户资产包：

```text
user-asset-pack.json
  layouts
  effects
  cues
  arrangements
```

localStorage 只作为当前工作区缓存，不作为用户配置的唯一长期来源。

### 4.2 使用原则

- 内置资产默认只读，用户修改时生成项目内副本，不覆盖内置源文件。
- 复制后的用户资产获得独立 ID，并可保留来源信息以便比较或重置。
- 内置资产可通过直接编辑 Catalog JSON 调整参数，并由构建校验和 Golden 测试保证有效。
- 用户资产支持项目内复制、独立导出、跨项目导入和冲突检查。
- “Reset defaults” 恢复内置模板和工作区选择，不删除用户显式导出的资产包。
- Generator、Effect Node 等执行行为仍由代码实现；Catalog 只保存可声明的参数和组合。

### 4.3 配置入口目标

最终只保留三类清晰入口：

1. 开发者编辑 `catalog/builtin/` 调整随 App 发布的内置资产。
2. 用户在 App 中复制或新建资产，保存进 ProjectBundle。
3. 用户通过资产包导入/导出完成复制、备份和迁移。

## 5. Authoring 文档迁移

### 5.1 唯一入口

建立：

```text
docs/authoring/README.md
```

它是 Layout、Stage、TargetSet、Effect、Cue、Arrangement、Live 和配置扩展的统一入口，并说明完整链路：

```text
Layout
  → Stage / Patch / TargetSet
  → Effect
  → Cue Layer
  → Arrangement CueClip
  → Live
```

### 5.2 文档结构

根据内容复杂度从入口链接到：

- `project-model.md`
- `layouts.md`
- `effects.md`
- `target-sets-and-cues.md`
- `arrangements.md`
- `catalog.md`
- `schema.md`

每个扩展文档只保留当前 V1 的概念、入口文件、必要检查清单和验收方式，不继续维护旧 Monaco/Phaser/Publish/Draft 等已退出主流程的指引。

### 5.3 迁移处理

1. 提取 `agent-docs/` 中仍有效的性能、编译器和引擎约束。
2. 将有效内容迁入 `docs/authoring/` 或现有 `docs/development.md`。
3. 更新 `AGENTS.md`，只指向新的 Authoring 入口及必要 ADR。
4. 标记或更新与当前 V1 冲突的 ADR。
5. 删除 `agent-docs/` 目录及所有引用。

## 建议执行阶段

### 阶段 A：V1 与 Catalog 基线

- 确认新的 V1 领域模型和 Catalog 目录边界。
- 完成 Schema 重置、本地数据重置策略和生成类型收敛。
- 建立内置资产加载与校验入口。

### 阶段 B：Layout 能力补全

- 增加 Sector、Polygon、Honeycomb。
- 保持 Formula/Algorithm 能力。
- 保留但不开放 Freeform/SVG。
- 验证 Layout 容量驱动 Stage fixtures 的完整链路。

### 阶段 C：Generator 收敛

- 统一参数、容量、坐标、校验和编辑能力。
- 消除前后端语义差异。
- 补齐跨 Stage、Lab、Cue、Arrange 的一致性验证。

### 阶段 D：内置资产与用户迁移

- 补充新的内置 Layout。
- 拆分和整理内置 Effect、Cue、Arrangement。
- 完成内置复制、用户资产包导入导出和 Reset 行为。

### 阶段 E：文档切换

- 建立 `docs/authoring/README.md`。
- 更新 `AGENTS.md`。
- 迁移有效内容并删除 `agent-docs/`。

## 不在本规划中的内容

- 完整自由布局拖拽编辑器。
- SVG 路径编辑、复杂填充和生产级导入。
- 在 Arrange Clip 中直接重新绑定 TargetSet。
- 正式发布后的历史项目兼容策略。
- Publish/Draft 等已退出核心流程的重新引入。

## 完成判定

- 所有活跃持久化与运行时契约使用新的 V1，不再存在历史迁移路径。
- Sector、Polygon、Honeycomb 和参数计算布局在 Stage、Lab、Cue、Arrange 中保持相同坐标和 fixture 数量。
- rings/rows/columns 等数量参数不会改变用户设置的 gap。
- Stage TargetSet → Cue Layer → Arrange CueClip 的多分区编排路径可完整操作和预览。
- 内置配置全部来自清晰拆分、可人工编辑的 Catalog；用户配置可复制、导出和导入。
- Reset 能恢复内置默认配置，同时不误删用户显式导出的资产。
- `AGENTS.md` 只指向新的统一入口，`agent-docs/` 已删除且无残留引用。
