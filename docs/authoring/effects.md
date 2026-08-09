# Effects

## 所有权

`EffectDefinitionDocument` 只描述 target-agnostic 的视觉行为：typed parameter schema、EffectGraph、capability、Catalog metadata 和风险信息。它不引用 Stage、Layout、fixture、TargetSet、Cue 或 Arrangement。

目标绑定发生在 Cue Layer。这样同一个 Effect 可以在不同 Stage 区域复用，同时保持精确、可验证的依赖关系。

## EffectGraph

Graph 连接使用结构化 node/port 引用。Rust compiler 在 render 前完成：

- node、port 和 parameter 类型检查；
- cycle、missing input 和 unreachable output 检查；
- parameter/node/attribute handle 解析；
- spatial phase 和 fixture context cache；
- seed 的稳定解析。

render 中的每个 node 都是 tick 与 fixture context 的确定性函数。相同 snapshot、tick、seed 和参数必须得到相同输出；Random 不得依赖共享可变 RNG。

Random 将 phase 0 保留为停止状态的静态预览；Transport 离开零点时立即进入第一个 seeded cycle，随后按整数 beat 周期稳定切换，避免播放开始后额外停留一拍。

## Authoring

- 内置 Effect 只读；**Customize** 复制为新的项目 Effect，并分配独立 ID。
- Lab 的 working changes 不立即写 ProjectBundle。Schema、semantic、reference、capability 和 preview compile 都通过后才能 Save。
- 非法更改保留表单内容并显示局部 Diagnostic，Canvas 保持 last-known-good frame。
- 参数 UI 只读取当前 Effect 的 parameter schema，不能按 Effect 名称写分支。
- 默认 speed 以及 Cue override 只接受 0.25×、0.5×、1×、2×、4×、8×。

### Standard Color override

Production Catalog 中的每个 Effect 都声明标准参数 `color`，使颜色编辑和自动化入口保持一致：

- `value_type: color`，值为严格的 `#RRGGBB`；
- `unit/ui_hint: color`；
- `override_policy: cue_override`；
- `automation: continuous`；
- 完整的 `required`、`help`、`safe_fallback` 和 `advanced` 元数据。

该参数是 Effect 最终 `color.rgb` 输出的可选单色覆盖，可从 Lab、Cue Layer override 和 Arrangement Color automation 到达。Color lane 在 runtime 使用 Lab 插值；endpoint 精确保留。`default_enabled` 缺省或为 `true` 时使用参数默认色；`false` 时保留 EffectGraph 自己的 Palette/颜色，或者让纯 intensity Effect 不写颜色。Lab 和 Cue UI 可以显式启用颜色，也可以清除颜色回到上述 Effect authored/fallback 行为；禁用的默认值本身不构成 `color.rgb` writer，只有显式 Cue/Arrangement override 或 automation 才构成。

结构性 Palette 继续使用 `color_stops`，只在 Lab 中编辑，并保持 `override_policy: effect_only`、`automation: disabled`。本版本不在 runtime 改变 stop 数量，也不做 stop-by-stop Arrangement automation。

兼容现有 Schema、参数和引用的 Catalog 修复直接更新当前源文件，不机械增加 revision。只有无法兼容、必须让新旧行为并存时才增加 revision，并同步更新需要迁移的 Cue exact ref。standard Color 兼容入口直接落在现有 Effect 源文件，Catalog 内不保留重复 rev2。

## 内置效果取舍

内置库按可观察的视觉意图区分，而不是按参数微调重复收录。V1 保留柔和、可塑形的 **Breathe**，删除与其图结构和输出过于接近的旧 **Pulse**；需要短促节拍时使用 **Short Color Burst** 或安全等级明确的 **Safe Strobe Pulse**。

矩阵空间效果包含：

- **Column Ping-Pong**：窄列在左右边界之间往返，不会退化为整场同步亮度变化。
- **Seeded Column Rain**：用 Cue Layer seed 对每个唯一 X 坐标生成稳定相位，同一列保持一致，并沿 Y 轴由上到下滚动。相同 seed、布局和 tick 必须重放一致。

`random_x` 是 SpatialPhase 的确定性空间 basis，只随机化列相位，不使用共享可变 RNG，也不按 fixture 逐个制造噪点。

Intensity parameter override 缩放 EffectGraph 已写出的 intensity；当 FixtureMask 关闭某个 fixture 时，override 不能绕过 mask 为它补写亮度。只在 EffectGraph 本身不拥有 intensity writer 时，显式 intensity override 才作为独立 dimmer 输出。

## Mix 与安全

Effect 写入 typed fixture attributes。Profile 提供默认 HTP/LTP policy，但当多个 Cue Layer 或重叠 CueClip 在同一 fixture 上写同一属性时，作者必须在 Cue Layer 明确选择 MixPolicy；Add、Multiply 和 Mask 永不因重叠自动启用。

高风险 strobe 继续要求显式确认和可信 Catalog metadata。Preview、Save 和 Go Live 都复用 Rust authority validation，不依赖 UI 曾经成功渲染。

## 关键实现

- Contract：`src-tauri/src/document/effect.rs`
- Graph validation/evaluation：`src-tauri/src/document/validation.rs`、`src-tauri/src/engine/effect.rs`
- Catalog validation：`src-tauri/src/document/production_catalog.rs`
- Lab：`src/workspace/effect-lab/`
- Working copy state：`src/stores/authoringDraft.ts`

## 验收

- 内置 Effect 修改不会改变 Catalog 文件或已存在项目资产。
- 参数变化在 Canvas 可见；无效参数不会替换最后有效预览。
- standard Color 在 Lab、Cue override、Arrangement lane 和 `color.rgb` render output 间保持 typed round-trip；清除后恢复 Effect authored/fallback 行为；`color_stops` 不出现在 automation 菜单。
- Effect 不包含任何 Stage/TargetSet identity。
- 1,000 fixtures × 多 Effect layers 仍保持确定性并满足 60Hz 预算。
